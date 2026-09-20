import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import { writeAdminAuditEventWithClient } from "@/lib/admin/audit";
import {
  beginAdminMfaEnrollment,
  AdminMfaLockedError,
  AdminMfaVerificationError,
  verifyAdminMfaEnrollmentWithClient,
} from "@/lib/admin/store";
import { INSTANCE_SETUP_LOCK } from "@/lib/admin/setup/repository";
import type { SetupSessionContext } from "@/lib/admin/setup/session";
import { SetupSessionInvalidError } from "@/lib/admin/setup/session";
import { getDatabasePool } from "@/lib/runtime/database";

export class SetupCompletionError extends Error {
  constructor(readonly code = "setup_completion_invalid") {
    super(code);
    this.name = "SetupCompletionError";
  }
}

export class SetupDuplicateEmailError extends SetupCompletionError {
  constructor() {
    super("setup_email_conflict");
    this.name = "SetupDuplicateEmailError";
  }
}

export class SetupInvalidPasswordError extends SetupCompletionError {
  constructor() {
    super("setup_password_invalid");
    this.name = "SetupInvalidPasswordError";
  }
}

export class SetupAlreadyCompletedError extends SetupCompletionError {
  constructor() {
    super("setup_already_completed");
    this.name = "SetupAlreadyCompletedError";
  }
}

export class SetupMfaVerificationError extends SetupCompletionError {
  constructor() {
    super("setup_mfa_invalid");
    this.name = "SetupMfaVerificationError";
  }
}

export class SetupMfaLockedError extends SetupCompletionError {
  constructor(readonly lockedUntil: Date) {
    super("setup_mfa_locked");
    this.name = "SetupMfaLockedError";
  }
}

interface SetupAccountInput {
  session: SetupSessionContext;
  name: string;
  email: string;
  password: string;
  deviceName: string;
}

export async function beginInstanceSetupAccount(input: SetupAccountInput) {
  validatePassword(input.password);
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const deviceName = input.deviceName.trim();
  if (!name || name.length > 100 || !deviceName || deviceName.length > 60) {
    throw new SetupCompletionError();
  }

  const prepared = await withSetupClient(async (client) => {
    const state = await requireSetupSessionWithClient(client, input.session);
    const existingEmail = await client.query<{ id: string }>(
      `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    let userId = state.targetUserId;
    if (existingEmail.rows[0] && existingEmail.rows[0].id !== userId) {
      throw new SetupDuplicateEmailError();
    }

    if (!userId) {
      if (state.state !== "pending_initialization") {
        throw new SetupCompletionError();
      }
      userId = randomUUID();
      await client.query(
        `INSERT INTO "user"
          (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, false, NULL, now(), now())`,
        [userId, name, email],
      );
      await client.query(
        `INSERT INTO ${schema()}.admin_principals
          (user_id, kind, singleton_slot, created_at, updated_at)
         VALUES ($1, 'super_admin', 1, now(), now())`,
        [userId],
      );
      await client.query(
        `UPDATE ${schema()}.instance_setup_state
            SET target_user_id = $1, updated_at = now()
          WHERE slot = 1`,
        [userId],
      );
    } else {
      const updated = await client.query(
        `UPDATE "user" SET name = $2, email = $3, "updatedAt" = now()
          WHERE id = $1 RETURNING id`,
        [userId, name, email],
      );
      if (updated.rowCount !== 1) throw new SetupCompletionError();
    }

    return {
      email,
      mode: state.state === "pending_initialization"
        ? "initialization" as const
        : "recovery" as const,
      userId,
    };
  });

  const enrollment = await beginAdminMfaEnrollment({
    userId: prepared.userId,
    email: prepared.email,
    name: deviceName,
    requireNoVerifiedDevices: prepared.mode === "initialization",
    allowTemporaryDeviceLimitOverflow: prepared.mode === "recovery",
  });
  return { email: prepared.email, ...enrollment };
}

export async function completeInstanceSetup(input: {
  session: SetupSessionContext;
  deviceId: string;
  code: string;
  password: string;
}) {
  validatePassword(input.password);
  const passwordHash = await hashPassword(input.password);
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      INSTANCE_SETUP_LOCK,
    ]);
    const state = await requireSetupSessionWithClient(client, input.session);
    if (!state.targetUserId) throw new SetupCompletionError();

    const identity = await client.query<{ email: string }>(
      `SELECT email FROM "user" WHERE id = $1 FOR UPDATE`,
      [state.targetUserId],
    );
    const email = identity.rows[0]?.email;
    if (!email) throw new SetupCompletionError();

    const recoveryCodes = await verifyAdminMfaEnrollmentWithClient({
      client,
      userId: state.targetUserId,
      deviceId: input.deviceId,
      token: input.code,
      replaceExistingDevices: true,
    });
    const now = new Date();
    await client.query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'credential', $2, $3, $4, $4, 'local:credential')
       ON CONFLICT (issuer, "accountId") DO UPDATE
         SET password = EXCLUDED.password, "updatedAt" = EXCLUDED."updatedAt"`,
      [randomUUID(), state.targetUserId, passwordHash, now],
    );
    await client.query(
      `UPDATE "user" SET "emailVerified" = true, "updatedAt" = $2
        WHERE id = $1`,
      [state.targetUserId, now],
    );
    await client.query(
      `UPDATE ${schema()}.instance_setup_state
          SET state = 'completed', target_user_id = NULL,
              recovery_reason = NULL, completed_at = $1, updated_at = $1
        WHERE slot = 1`,
      [now],
    );
    await client.query(`DELETE FROM ${schema()}.instance_setup_sessions`);
    await client.query(`DELETE FROM ${schema()}.instance_setup_tokens`);
    await client.query(`DELETE FROM ${schema()}.instance_setup_claim_limits`);
    await writeAdminAuditEventWithClient(client, {
      actorUserId: state.targetUserId,
      action: state.state === "pending_initialization"
        ? "instance.setup.completed"
        : "instance.admin_recovery.completed",
      targetType: "instance_setup",
      targetId: state.targetUserId,
      outcome: "success",
      metadata: {
        mode: state.state === "pending_initialization"
          ? "initialization"
          : "recovery",
      },
    });
    await client.query("COMMIT");
    return { email, recoveryCodes };
  } catch (error) {
    if (error instanceof AdminMfaVerificationError) {
      await client.query("COMMIT").catch(() => undefined);
      throw new SetupMfaVerificationError();
    }
    if (error instanceof AdminMfaLockedError) {
      await client.query("COMMIT").catch(() => undefined);
      throw new SetupMfaLockedError(error.lockedUntil);
    }
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      throw new SetupDuplicateEmailError();
    }
    throw error;
  } finally {
    client.release();
  }
}

function validatePassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    throw new SetupInvalidPasswordError();
  }
}

async function withSetupClient<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      INSTANCE_SETUP_LOCK,
    ]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      throw new SetupDuplicateEmailError();
    }
    throw error;
  } finally {
    client.release();
  }
}

async function requireSetupSessionWithClient(
  client: PoolClient,
  session: SetupSessionContext,
) {
  const stateResult = await client.query<{
    state: "pending_initialization" | "pending_admin_recovery" | "completed";
    targetUserId: string | null;
  }>(
    `SELECT state, target_user_id AS "targetUserId"
       FROM ${schema()}.instance_setup_state
      WHERE slot = 1 FOR UPDATE`,
  );
  const state = stateResult.rows[0];
  if (!state) throw new SetupCompletionError();
  if (state.state === "completed") throw new SetupAlreadyCompletedError();

  const sessionResult = await client.query(
    `SELECT session.id
       FROM ${schema()}.instance_setup_sessions AS session
       JOIN ${schema()}.instance_setup_tokens AS token
         ON token.generation = session.generation
      WHERE session.id = $1 AND session.generation = $2
        AND session.expires_at > now()
      LIMIT 1`,
    [session.sessionId, session.generation],
  );
  if (sessionResult.rowCount !== 1) throw new SetupSessionInvalidError();
  return state;
}

function schema() {
  return `"${getDatabaseSchemaName().replaceAll('"', '""')}"`;
}
