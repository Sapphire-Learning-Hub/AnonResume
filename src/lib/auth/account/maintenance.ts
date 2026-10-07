import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function table(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

async function finalizeDueAccount(userId: string, now: Date) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `anonresume:account-deletion:${userId}`,
    ]);
    const lifecycle = await client.query<{
      deletionDueAt: Date;
      status: string;
    }>(
      `SELECT status, deletion_due_at AS "deletionDueAt"
         FROM ${table("account_lifecycle")}
        WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const state = lifecycle.rows[0];
    if (
      !state ||
      state.status !== "pending_deletion" ||
      state.deletionDueAt > now
    ) {
      await client.query("ROLLBACK");
      return null;
    }
    const identityResult = await client.query<{ email: string; name: string }>(
      `SELECT email, name FROM "user" WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const identity = identityResult.rows[0];
    if (!identity) throw new Error("account_identity_missing");
    const tombstoneEmail = `deleted+${userId}@deleted.invalid`;

    await deleteProjectOwnedData(client, userId, identity.email, tombstoneEmail, now);
    await client.query(
      `DELETE FROM "verification"
        WHERE value = $1 OR lower(identifier) = lower($2)`,
      [userId, identity.email],
    );
    await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [userId]);
    await client.query(`DELETE FROM "account" WHERE "userId" = $1`, [userId]);
    await client.query(
      `UPDATE "user"
          SET name = 'Deleted user', email = $2, "emailVerified" = false,
              image = NULL, "updatedAt" = $3
        WHERE id = $1`,
      [userId, tombstoneEmail, now],
    );
    await client.query(
      `UPDATE ${table("account_lifecycle")}
          SET status = 'deleted', deleted_at = $2, updated_at = $2
        WHERE user_id = $1 AND status = 'pending_deletion'`,
      [userId, now],
    );
    await client.query("COMMIT");
    return identity;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function deleteProjectOwnedData(
  client: PoolClient,
  userId: string,
  originalEmail: string,
  tombstoneEmail: string,
  now: Date,
) {
  await client.query(
    `UPDATE ${table("pdf_export_jobs")}
        SET status = CASE WHEN status IN ('queued', 'running') THEN 'cancelled' ELSE status END,
            cancel_requested = true, result = NULL, access_token_hash = '',
            completed_at = COALESCE(completed_at, $2), result_expires_at = $2
      WHERE requester_user_id = $1`,
    [userId, now],
  );
  await client.query(`DELETE FROM ${table("admin_sessions")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("admin_assignments")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("admin_activation_tokens")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("admin_recovery_codes")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("admin_mfa_devices")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("admin_security_states")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("admin_mfa_reset_requests")} WHERE requester_user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("admin_principals")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("account_restrictions")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("onboarding_runs")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("resumes")} WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("ai_provider_credentials")} WHERE owner_user_id = $1`, [userId]);
  await client.query(`DELETE FROM ${table("ai_quota_accounts")} WHERE user_id = $1`, [userId]);
  await client.query(
    `UPDATE ${table("ai_usage_ledger")} SET metadata = '{}'::jsonb
      WHERE user_id = $1`,
    [userId],
  );
  await client.query(
    `UPDATE ${table("user_invitations")}
        SET invited_email = $1, token_hash = NULL,
            invalidated_at = COALESCE(invalidated_at, $2), updated_at = $2
      WHERE lower(invited_email) = lower($3)`,
    [tombstoneEmail, now, originalEmail],
  );
  await client.query(
    `UPDATE ${table("admin_audit_events")}
        SET metadata = jsonb_build_object('accountLifecycle', 'deleted')
      WHERE actor_user_id = $1 OR target_id = $1`,
    [userId],
  );
  await client.query(`DELETE FROM ${table("account_email_challenges")} WHERE user_id = $1`, [userId]);
}

export async function runAccountMaintenance(input: {
  now?: Date;
  limit?: number;
  notifyDeleted?: (identity: { email: string; name: string }) => Promise<void>;
} = {}) {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const candidates = await getDatabasePool().query<{ userId: string }>(
    `SELECT user_id AS "userId" FROM ${table("account_lifecycle")}
      WHERE status = 'pending_deletion' AND deletion_due_at <= $1
      ORDER BY deletion_due_at ASC, user_id ASC LIMIT $2`,
    [now, limit],
  );
  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates.rows) {
    try {
      const identity = await finalizeDueAccount(candidate.userId, now);
      if (!identity) continue;
      deleted += 1;
      await input.notifyDeleted?.(identity).catch((error: unknown) => {
        console.error("[AnonResume] Failed to send account deletion notice", error);
      });
    } catch (error) {
      failed += 1;
      console.error(
        `[AnonResume] Failed to finalize account deletion for ${candidate.userId}`,
        error,
      );
    }
  }
  return { processed: candidates.rows.length, deleted, failed };
}
