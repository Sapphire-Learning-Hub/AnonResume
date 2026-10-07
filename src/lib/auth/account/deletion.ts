import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

import { consumeAccountEmailChallenge } from "./challenges";
import { AccountSecurityError } from "./errors";
import { deliverPostCommitAccountNotice } from "./notifications";
import { getAccountLifecycle } from "./repository";
import {
  verifyAccountPassword,
  verifyAccountPasswordWithClient,
} from "./security";

const COOLING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function table(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

async function withDeletionTransaction<T>(
  userId: string,
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `anonresume:account-deletion:${userId}`,
    ]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getIdentityWithClient(client: PoolClient, userId: string) {
  const result = await client.query<{
    email: string;
    name: string;
  }>(`SELECT email, name FROM "user" WHERE id = $1`, [userId]);
  const identity = result.rows[0];
  if (!identity) throw new AccountSecurityError("account_unavailable");
  return identity;
}

async function getIdentity(userId: string) {
  const client = await getDatabasePool().connect();
  try {
    return await getIdentityWithClient(client, userId);
  } finally {
    client.release();
  }
}

async function keepOnlyCurrentSession(
  client: PoolClient,
  userId: string,
  currentSessionToken: string,
) {
  if (!currentSessionToken) {
    throw new AccountSecurityError("current_session_required");
  }
  await client.query(
    `DELETE FROM "session" WHERE "userId" = $1 AND token <> $2`,
    [userId, currentSessionToken],
  );
  await client.query(`DELETE FROM ${table("admin_sessions")} WHERE user_id = $1`, [
    userId,
  ]);
}

export async function submitAccountDeletion(input: {
  userId: string;
  currentSessionToken: string;
  password: string;
  code: string;
  now?: Date;
  notify: (identity: {
    email: string;
    name: string;
    deletionDueAt: Date;
  }) => Promise<void>;
}) {
  const now = input.now ?? new Date();
  await verifyAccountPassword({
    userId: input.userId,
    password: input.password,
  });
  const identity = await getIdentity(input.userId);
  await consumeAccountEmailChallenge({
    userId: input.userId,
    purpose: "delete_account",
    email: identity.email,
    code: input.code,
    now,
  });
  const deletionDueAt = new Date(now.getTime() + COOLING_PERIOD_MS);

  const committedIdentity = await withDeletionTransaction(
    input.userId,
    async (client) => {
      const lifecycle = await client.query<{ status: string }>(
        `SELECT status FROM ${table("account_lifecycle")}
          WHERE user_id = $1 FOR UPDATE`,
        [input.userId],
      );
      if (lifecycle.rows[0] && lifecycle.rows[0].status !== "active") {
        throw new AccountSecurityError("account_unavailable");
      }
      const currentIdentity = await getIdentityWithClient(client, input.userId);
      if (currentIdentity.email !== identity.email) {
        throw new AccountSecurityError("account_unavailable");
      }
      await verifyAccountPasswordWithClient(
        client,
        input.userId,
        input.password,
      );
      await client.query(
        `INSERT INTO ${table("account_lifecycle")}
          (user_id, status, deletion_requested_at, deletion_due_at, deleted_at,
           created_at, updated_at)
         VALUES ($1, 'pending_deletion', $2, $3, NULL, $2, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           status = 'pending_deletion', deletion_requested_at = EXCLUDED.deletion_requested_at,
           deletion_due_at = EXCLUDED.deletion_due_at, deleted_at = NULL,
           updated_at = EXCLUDED.updated_at`,
        [input.userId, now, deletionDueAt],
      );
      await client.query(
        `UPDATE ${table("resumes")}
            SET published = false, slug = NULL, updated_at = $2
          WHERE user_id = $1`,
        [input.userId, now],
      );
      await client.query(
        `UPDATE ${table("pdf_export_jobs")}
            SET status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
                cancel_requested = CASE WHEN status = 'running' THEN true ELSE cancel_requested END,
                completed_at = CASE WHEN status = 'queued' THEN $2 ELSE completed_at END
          WHERE requester_user_id = $1 OR resume_user_id = $1`,
        [input.userId, now],
      );
      await client.query(
        `UPDATE ${table("ai_runs")}
            SET stop_requested_at = COALESCE(stop_requested_at, $2), updated_at = $2
          WHERE user_id = $1 AND status IN ('queued', 'preparing', 'streaming')`,
        [input.userId, now],
      );
      await keepOnlyCurrentSession(
        client,
        input.userId,
        input.currentSessionToken,
      );
      return currentIdentity;
    },
  );

  await deliverPostCommitAccountNotice(
    () => input.notify({ ...committedIdentity, deletionDueAt }),
    "deletion_requested",
  );
  return { deletionDueAt };
}

export async function restoreAccountDeletion(input: {
  userId: string;
  currentSessionToken: string;
  password: string;
  code: string;
  now?: Date;
  notify: (identity: { email: string; name: string }) => Promise<void>;
}) {
  const now = input.now ?? new Date();
  const lifecycle = await getAccountLifecycle(input.userId);
  if (
    lifecycle.status !== "pending_deletion" ||
    !lifecycle.deletionDueAt ||
    lifecycle.deletionDueAt <= now
  ) {
    throw new AccountSecurityError("recovery_period_ended");
  }
  await verifyAccountPassword({
    userId: input.userId,
    password: input.password,
    allowPendingDeletion: true,
  });
  const identity = await getIdentity(input.userId);
  await consumeAccountEmailChallenge({
    userId: input.userId,
    purpose: "restore_account",
    email: identity.email,
    code: input.code,
    now,
  });

  await withDeletionTransaction(input.userId, async (client) => {
    const currentIdentity = await getIdentityWithClient(client, input.userId);
    if (currentIdentity.email !== identity.email) {
      throw new AccountSecurityError("account_unavailable");
    }
    await verifyAccountPasswordWithClient(
      client,
      input.userId,
      input.password,
    );
    const restored = await client.query(
      `UPDATE ${table("account_lifecycle")}
          SET status = 'active', deletion_requested_at = NULL,
              deletion_due_at = NULL, deleted_at = NULL, updated_at = $2
        WHERE user_id = $1 AND status = 'pending_deletion'
          AND deletion_due_at > $2`,
      [input.userId, now],
    );
    if (restored.rowCount !== 1) {
      throw new AccountSecurityError("recovery_period_ended");
    }
    await keepOnlyCurrentSession(
      client,
      input.userId,
      input.currentSessionToken,
    );
  });
  await deliverPostCommitAccountNotice(
    () => input.notify(identity),
    "account_restored",
  );
}
