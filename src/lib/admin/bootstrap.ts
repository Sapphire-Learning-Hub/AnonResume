import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";

import { resolveAdminSuperAdminEmail } from "@/lib/admin/configuration";
import { getInstanceSetupSnapshot } from "@/lib/admin/setup/repository";
import type { InstanceSetupState } from "@/lib/admin/setup/types";
import { getDatabasePool } from "@/lib/runtime/database";
import { sendSuperAdminActivationEmail } from "@/lib/runtime/email";
import { resolveApplicationOriginForBootstrap } from "@/lib/runtime/configuration";

const BOOTSTRAP_LOCK = "anonresume:super-admin-bootstrap";
const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

export const LEGACY_BOOTSTRAP_WARNING =
  "[AnonResume] Deprecated: terminal super-admin bootstrap is retained for one compatibility release. Use the startup code and /setup instead.";

type InspectSetupState = () => Promise<{ state: InstanceSetupState }>;

export class AdminSingletonViolationError extends Error {
  constructor(public readonly userIds: string[]) {
    super(
      `Multiple active super-admins detected (${userIds.join(", ")}). Run bun run admin:doctor and bun run admin:repair-super-admin --keep <user-id>.`,
    );
    this.name = "AdminSingletonViolationError";
  }
}

export class AdminBootstrapConflictError extends Error {
  constructor(email: string) {
    super(
      `The configured super-admin email ${email} already belongs to a product account. Configure a dedicated email address.`,
    );
    this.name = "AdminBootstrapConflictError";
  }
}

export interface AdminBootstrapTransaction {
  listActiveSuperAdmins(): Promise<Array<{ userId: string }>>;
  findIdentityByEmail(email: string): Promise<{ userId: string } | null>;
  createPendingIdentity(email: string): Promise<{ userId: string }>;
  createSuperAdminPrincipal(userId: string): Promise<void>;
  createActivationToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
}

export interface AdminBootstrapStore {
  withBootstrapLock<T>(
    callback: (transaction: AdminBootstrapTransaction) => Promise<T>,
  ): Promise<T>;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

class PostgresAdminBootstrapTransaction
  implements AdminBootstrapTransaction
{
  private readonly schema: string;

  constructor(private readonly client: PoolClient) {
    this.schema = quoteIdentifier(getDatabaseSchemaName());
  }

  async listActiveSuperAdmins() {
    const result = await this.client.query<{ userId: string }>(
      `SELECT user_id AS "userId"
         FROM ${this.schema}.admin_principals
        WHERE kind = 'super_admin'
          AND quarantined_at IS NULL
        ORDER BY created_at ASC, user_id ASC`,
    );
    return result.rows;
  }

  async findIdentityByEmail(email: string) {
    const result = await this.client.query<{ userId: string }>(
      `SELECT id AS "userId"
         FROM "user"
        WHERE lower(email) = lower($1)
        LIMIT 1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async createPendingIdentity(email: string) {
    const userId = randomUUID();
    await this.client.query(
      `INSERT INTO "user"
        (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, false, NULL, now(), now())`,
      [userId, "AnonResume 超级管理员", email],
    );
    return { userId };
  }

  async createSuperAdminPrincipal(userId: string) {
    await this.client.query(
      `INSERT INTO ${this.schema}.admin_principals
        (user_id, kind, singleton_slot, created_at, updated_at)
       VALUES ($1, 'super_admin', 1, now(), now())`,
      [userId],
    );
  }

  async createActivationToken({
    userId,
    tokenHash,
    expiresAt,
  }: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    await this.client.query(
      `INSERT INTO ${this.schema}.admin_activation_tokens
        (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );
  }
}

export class PostgresAdminBootstrapStore implements AdminBootstrapStore {
  async withBootstrapLock<T>(
    callback: (transaction: AdminBootstrapTransaction) => Promise<T>,
  ) {
    const client = await getDatabasePool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        BOOTSTRAP_LOCK,
      ]);
      const result = await callback(
        new PostgresAdminBootstrapTransaction(client),
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function bootstrapSuperAdmin({
  store,
  email,
  applicationOrigin,
  deliverActivation,
}: {
  store: AdminBootstrapStore;
  email: string;
  applicationOrigin: string;
  deliverActivation: (input: { email: string; url: string }) => Promise<void>;
}) {
  return store.withBootstrapLock(async (transaction) => {
    const existing = await transaction.listActiveSuperAdmins();
    if (existing.length > 1) {
      throw new AdminSingletonViolationError(
        existing.map((principal) => principal.userId),
      );
    }
    if (existing[0]) {
      return { state: "existing" as const, userId: existing[0].userId };
    }

    if (await transaction.findIdentityByEmail(email)) {
      throw new AdminBootstrapConflictError(email);
    }

    const { userId } = await transaction.createPendingIdentity(email);
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256")
      .update(rawToken, "utf8")
      .digest("hex");
    await transaction.createSuperAdminPrincipal(userId);
    await transaction.createActivationToken({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
    });

    const url = new URL("/activate", applicationOrigin);
    url.searchParams.set("token", rawToken);
    await deliverActivation({ email, url: url.toString() });

    return { state: "created" as const, userId };
  });
}

export async function bootstrapConfiguredSuperAdmin(
  environment: NodeJS.ProcessEnv,
  inspectSetupState: InspectSetupState = getInstanceSetupSnapshot,
) {
  const email = resolveAdminSuperAdminEmail(environment);
  if (!email) {
    return { state: "skipped" as const };
  }

  const setup = await inspectSetupState();
  if (setup.state !== "pending_initialization") {
    return {
      state: "unavailable" as const,
      setupState: setup.state,
    };
  }

  return bootstrapSuperAdmin({
    store: new PostgresAdminBootstrapStore(),
    email,
    applicationOrigin: resolveApplicationOriginForBootstrap(environment),
    deliverActivation: sendSuperAdminActivationEmail,
  });
}

export async function bootstrapSuperAdminForTerminal(input: {
  store?: AdminBootstrapStore;
  email: string;
  applicationOrigin: string;
  inspectSetupState?: InspectSetupState;
}) {
  const setup = await (input.inspectSetupState ?? getInstanceSetupSnapshot)();
  if (setup.state !== "pending_initialization") {
    return {
      state: "unavailable" as const,
      setupState: setup.state,
    };
  }

  let activationUrl: string | undefined;
  const result = await bootstrapSuperAdmin({
    store: input.store ?? new PostgresAdminBootstrapStore(),
    email: input.email,
    applicationOrigin: input.applicationOrigin,
    deliverActivation: async ({ url }) => {
      activationUrl = url;
    },
  });

  if (result.state === "created" && !activationUrl) {
    throw new Error("Super-admin activation URL was not created");
  }

  return result.state === "created"
    ? { ...result, activationUrl: activationUrl! }
    : result;
}
