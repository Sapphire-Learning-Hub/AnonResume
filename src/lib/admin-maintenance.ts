import { randomBytes } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";

import { hashAdminSecret } from "./admin-crypto";
import {
  createAdminAuditChanges,
  writeAdminAuditEventWithClient,
} from "./admin-audit";
import { getDatabasePool } from "./database";
import { sendSuperAdminActivationEmail } from "./email";
import { resolveApplicationOriginForBootstrap } from "./runtime-configuration";

const REPAIR_LOCK = "anonresume:super-admin-repair";
const MFA_RESET_LOCK = "anonresume:super-admin-mfa-reset";
const MFA_RESET_TTL_MS = 24 * 60 * 60 * 1000;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export interface AdminDoctorReport {
  healthy: boolean;
  activeSuperAdmins: Array<{ userId: string; email: string }>;
  quarantinedAdmins: number;
  delegatedAdmins: number;
  orphanAssignments: number;
}

export async function diagnoseAdminState(): Promise<AdminDoctorReport> {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const pool = getDatabasePool();
  const [principals, orphanAssignments] = await Promise.all([
    pool.query<{
      userId: string;
      email: string;
      kind: string;
      quarantinedAt: Date | null;
    }>(`SELECT principal.user_id AS "userId", identity.email,
          principal.kind, principal.quarantined_at AS "quarantinedAt"
        FROM ${schema}.admin_principals AS principal
        LEFT JOIN "user" AS identity ON identity.id = principal.user_id
        ORDER BY principal.created_at ASC`),
    pool.query<{ count: string }>(`SELECT count(*)::text AS count
        FROM ${schema}.admin_assignments AS assignment
        LEFT JOIN ${schema}.admin_roles AS role ON role.id = assignment.role_id
        LEFT JOIN ${schema}.admin_principals AS principal
          ON principal.user_id = assignment.user_id
        WHERE role.id IS NULL OR principal.kind <> 'delegated_admin'
          OR principal.quarantined_at IS NOT NULL`),
  ]);
  const activeSuperAdmins = principals.rows
    .filter(
      (principal) =>
        principal.kind === "super_admin" && !principal.quarantinedAt,
    )
    .map(({ userId, email }) => ({ userId, email }));

  return {
    healthy:
      activeSuperAdmins.length === 1 &&
      Number(orphanAssignments.rows[0]?.count) === 0,
    activeSuperAdmins,
    quarantinedAdmins: principals.rows.filter(
      (principal) => principal.kind === "quarantined_admin",
    ).length,
    delegatedAdmins: principals.rows.filter(
      (principal) =>
        principal.kind === "delegated_admin" && !principal.quarantinedAt,
    ).length,
    orphanAssignments: Number(orphanAssignments.rows[0]?.count),
  };
}

export async function repairSuperAdminSingleton(keepUserId: string) {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      REPAIR_LOCK,
    ]);
    const result = await client.query<{ userId: string }>(
      `SELECT user_id AS "userId" FROM ${schema}.admin_principals
        WHERE kind = 'super_admin' AND quarantined_at IS NULL
        ORDER BY created_at ASC FOR UPDATE`,
    );
    if (!result.rows.some((row) => row.userId === keepUserId)) {
      throw new Error("--keep must identify one active super-admin");
    }

    const quarantinedIds = result.rows
      .map((row) => row.userId)
      .filter((userId) => userId !== keepUserId);
    if (quarantinedIds.length) {
      await client.query(
        `UPDATE ${schema}.admin_principals
            SET kind = 'quarantined_admin', singleton_slot = NULL,
                quarantined_at = now(), updated_at = now()
          WHERE user_id = ANY($1::text[])`,
        [quarantinedIds],
      );
      await client.query(
        `DELETE FROM ${schema}.admin_assignments
          WHERE user_id = ANY($1::text[])`,
        [quarantinedIds],
      );
      await client.query(
        `UPDATE ${schema}.admin_sessions SET revoked_at = now()
          WHERE user_id = ANY($1::text[]) AND revoked_at IS NULL`,
        [quarantinedIds],
      );
      await client.query(
        `DELETE FROM "session" WHERE "userId" = ANY($1::text[])`,
        [quarantinedIds],
      );
    }
    await client.query(
      `UPDATE ${schema}.admin_principals
          SET singleton_slot = 1, updated_at = now()
        WHERE user_id = $1 AND kind = 'super_admin'`,
      [keepUserId],
    );
    await writeAdminAuditEventWithClient(client, {
      action: "super_admin.repair",
      targetType: "user",
      targetId: keepUserId,
      outcome: "success",
      metadata: {
        changes: createAdminAuditChanges(
          { activeSuperAdminIds: result.rows.map((row) => row.userId) },
          { activeSuperAdminIds: [keepUserId] },
        ),
        quarantinedUserIds: quarantinedIds,
      },
    });
    await client.query("COMMIT");
    return { keepUserId, quarantinedUserIds: quarantinedIds };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function resetSuperAdminMfa(email: string) {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      MFA_RESET_LOCK,
    ]);
    const principal = await client.query<{ userId: string; email: string }>(
      `SELECT principal.user_id AS "userId", identity.email
         FROM ${schema}.admin_principals AS principal
         JOIN "user" AS identity ON identity.id = principal.user_id
        WHERE principal.kind = 'super_admin'
          AND principal.quarantined_at IS NULL
          AND lower(identity.email) = lower($1)
        FOR UPDATE OF principal`,
      [email.trim()],
    );
    if (principal.rowCount !== 1) {
      throw new Error("The email must identify the active singleton super-admin");
    }
    const identity = principal.rows[0]!;
    const rawToken = randomBytes(32).toString("base64url");

    await client.query(
      `UPDATE ${schema}.admin_activation_tokens SET consumed_at = now()
        WHERE user_id = $1 AND consumed_at IS NULL`,
      [identity.userId],
    );
    await client.query(
      `DELETE FROM ${schema}.admin_mfa_devices WHERE user_id = $1`,
      [identity.userId],
    );
    await client.query(
      `DELETE FROM ${schema}.admin_recovery_codes WHERE user_id = $1`,
      [identity.userId],
    );
    await client.query(
      `INSERT INTO ${schema}.admin_security_states
        (user_id, failed_attempts, locked_until, recovery_required, updated_at)
       VALUES ($1, 0, NULL, true, now())
       ON CONFLICT (user_id) DO UPDATE SET
         failed_attempts = 0, locked_until = NULL,
         recovery_required = true, updated_at = now()`,
      [identity.userId],
    );
    await client.query(
      `UPDATE ${schema}.admin_sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [identity.userId],
    );
    await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [identity.userId]);
    await client.query(
      `INSERT INTO ${schema}.admin_activation_tokens
        (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [
        identity.userId,
        hashAdminSecret(rawToken),
        new Date(Date.now() + MFA_RESET_TTL_MS),
      ],
    );
    await writeAdminAuditEventWithClient(client, {
      action: "super_admin.mfa_reset",
      targetType: "user",
      targetId: identity.userId,
      outcome: "success",
      metadata: {
        changes: createAdminAuditChanges(
          { mfaState: "configured" },
          { mfaState: "recovery_required" },
        ),
        targetSnapshot: {
          label: identity.email,
          description: identity.email,
        },
      },
    });

    const url = new URL(
      "/activate",
      resolveApplicationOriginForBootstrap(process.env),
    );
    url.searchParams.set("token", rawToken);
    await sendSuperAdminActivationEmail({
      email: identity.email,
      url: url.toString(),
    });
    await client.query("COMMIT");
    return { userId: identity.userId, email: identity.email };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
