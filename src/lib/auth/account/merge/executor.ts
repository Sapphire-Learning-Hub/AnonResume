import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";
import { sendAccountSecurityNotice } from "@/lib/runtime/email";

import { AccountMergeError } from "./errors";
import { executeAccountMergeTransfer } from "./transfer";

const EXECUTOR_LEASE_MS = 15_000;
const NOTICE_LEASE_MS = 30_000;
const NOTICE_MAX_ATTEMPTS = 5;
const MAX_OPERATION_RETRIES = 5;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function table(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

type OperationRow = {
  id: string;
  state: string;
  primaryUserId: string | null;
  secondaryUserId: string | null;
  initiatingUserId: string;
  targetUserId: string;
  waitDeadline: Date | null;
  retryCount: number;
  locale: "zh-CN" | "en-US";
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
};

async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function loadOperation(client: PoolClient, operationId: string) {
  const result = await client.query<OperationRow>(
    `SELECT id, state, primary_user_id AS "primaryUserId",
            secondary_user_id AS "secondaryUserId",
            initiating_user_id AS "initiatingUserId",
            target_user_id AS "targetUserId",
            wait_deadline AS "waitDeadline", retry_count AS "retryCount", locale,
            lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt"
       FROM ${table("account_merge_operations")}
      WHERE id = $1 FOR UPDATE`,
    [operationId],
  );
  return result.rows[0] ?? null;
}

export async function hasActiveAccountMergeWork(
  userIds: readonly string[],
  client?: PoolClient,
) {
  if (userIds.length === 0) return false;
  const executor = client ?? getDatabasePool();
  const result = await executor.query<{ active: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM ${table("pdf_export_jobs")}
        WHERE (requester_user_id = ANY($1::text[])
           OR resume_user_id = ANY($1::text[]))
          AND status IN ('queued', 'running')
       UNION ALL
       SELECT 1 FROM ${table("ai_runs")}
        WHERE user_id = ANY($1::text[])
          AND status IN ('queued', 'preparing', 'streaming', 'settlement_pending')
     ) AS active`,
    [userIds],
  );
  return Boolean(result.rows[0]?.active);
}

async function participantIdentities(
  client: PoolClient,
  operation: OperationRow,
) {
  const primaryId = operation.primaryUserId ?? operation.initiatingUserId;
  const secondaryId = operation.secondaryUserId ?? operation.targetUserId;
  const result = await client.query<{
    id: string;
    email: string;
    name: string;
  }>(`SELECT id, email, name FROM "user" WHERE id = ANY($1::text[])`, [
    [primaryId, secondaryId],
  ]);
  return result.rows;
}

async function enqueueTerminalNotices(
  client: PoolClient,
  operation: OperationRow,
  event: "merge_timed_out" | "merge_failed",
  now: Date,
) {
  const identities = await participantIdentities(client, operation);
  if (identities.length === 0) return;
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  for (const identity of identities) {
    await client.query(
      `INSERT INTO ${table("account_merge_notification_outbox")}
        (operation_id, recipient_email, recipient_name, event, locale,
         expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [
        operation.id,
        identity.email,
        identity.name,
        event,
        operation.locale,
        expiresAt,
        now,
      ],
    );
  }
}

async function terminateOperation(
  operationId: string,
  state: "expired" | "failed",
  failureCode: string,
  event: "merge_timed_out" | "merge_failed",
  now: Date,
) {
  await withTransaction(async (client) => {
    const operation = await loadOperation(client, operationId);
    if (!operation || ["completed", "expired", "failed", "cancelled"].includes(operation.state)) {
      return;
    }
    await enqueueTerminalNotices(client, operation, event, now);
    await client.query(
      `UPDATE ${table("account_merge_operations")}
          SET state = $2, failure_code = $3, lease_owner = NULL,
              lease_expires_at = NULL, updated_at = $4
        WHERE id = $1`,
      [operation.id, state, failureCode, now],
    );
    await client.query(
      `DELETE FROM ${table("account_merge_locks")} WHERE operation_id = $1`,
      [operation.id],
    );
  });
}

function isTransientDatabaseError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";
  return ["40001", "40P01", "55P03", "57P01", "08000", "08006"].includes(code);
}

async function releaseForRetry(operationId: string, now: Date) {
  await getDatabasePool().query(
    `UPDATE ${table("account_merge_operations")}
        SET state = 'waiting', retry_count = retry_count + 1,
            lease_owner = NULL, lease_expires_at = NULL, updated_at = $2
      WHERE id = $1 AND state = 'merging'`,
    [operationId, now],
  );
}

export async function advanceAccountMergeOperation(input: {
  operationId: string;
  workerId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const workerId = input.workerId ?? `inline-${randomUUID()}`;
  const decision = await withTransaction(async (client) => {
    const operation = await loadOperation(client, input.operationId);
    if (!operation) throw new AccountMergeError("operation_invalid");
    if (["completed", "expired", "failed", "cancelled"].includes(operation.state)) {
      return { action: "terminal" as const, state: operation.state };
    }
    if (!operation.primaryUserId || !operation.secondaryUserId) {
      throw new AccountMergeError("operation_invalid");
    }
    if (
      operation.state === "merging" &&
      operation.leaseExpiresAt &&
      operation.leaseExpiresAt > now &&
      operation.leaseOwner !== workerId
    ) {
      return { action: "waiting" as const };
    }
    if (operation.waitDeadline && operation.waitDeadline <= now) {
      return { action: "expire" as const };
    }
    const active = await hasActiveAccountMergeWork(
      [operation.primaryUserId, operation.secondaryUserId],
      client,
    );
    if (active) {
      await client.query(
        `UPDATE ${table("account_merge_operations")}
            SET state = 'waiting', lease_owner = NULL, lease_expires_at = NULL,
                updated_at = $2 WHERE id = $1`,
        [operation.id, now],
      );
      return { action: "waiting" as const };
    }
    await client.query(
      `UPDATE ${table("account_merge_operations")}
          SET state = 'merging', lease_owner = $2, lease_expires_at = $3,
              started_at = COALESCE(started_at, $4), updated_at = $4
        WHERE id = $1`,
      [operation.id, workerId, new Date(now.getTime() + EXECUTOR_LEASE_MS), now],
    );
    return { action: "execute" as const, retryCount: operation.retryCount };
  });

  if (decision.action === "terminal") return { state: decision.state };
  if (decision.action === "waiting") return { state: "waiting" as const };
  if (decision.action === "expire") {
    await terminateOperation(
      input.operationId,
      "expired",
      "active_work_timeout",
      "merge_timed_out",
      now,
    );
    return { state: "expired" as const };
  }

  try {
    return await executeAccountMergeTransfer({ operationId: input.operationId, now });
  } catch (error) {
    if (isTransientDatabaseError(error) && decision.retryCount + 1 < MAX_OPERATION_RETRIES) {
      await releaseForRetry(input.operationId, now);
      return { state: "waiting" as const };
    }
    await terminateOperation(
      input.operationId,
      "failed",
      error instanceof AccountMergeError ? error.code : "merge_failed",
      "merge_failed",
      now,
    );
    return { state: "failed" as const };
  }
}

export async function runAccountMergeExecutor(input: {
  workerId?: string;
  now?: Date;
  limit?: number;
} = {}) {
  const now = input.now ?? new Date();
  const workerId = input.workerId ?? `merge-executor-${randomUUID()}`;
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const candidates = await getDatabasePool().query<{ id: string }>(
    `SELECT id FROM ${table("account_merge_operations")}
      WHERE state IN ('confirmed', 'waiting')
         OR (state = 'merging' AND (lease_expires_at IS NULL OR lease_expires_at <= $1))
      ORDER BY created_at ASC, id ASC LIMIT $2`,
    [now, limit],
  );
  let completed = 0;
  let waiting = 0;
  let failed = 0;
  for (const candidate of candidates.rows) {
    const result = await advanceAccountMergeOperation({
      operationId: candidate.id,
      workerId,
      now,
    });
    if (result.state === "completed") completed += 1;
    else if (result.state === "waiting") waiting += 1;
    else if (result.state === "failed" || result.state === "expired") failed += 1;
  }
  return { processed: candidates.rows.length, completed, waiting, failed };
}

export async function assertAccountMergeMutationAllowed(userId: string) {
  const result = await getDatabasePool().query(
    `SELECT 1 FROM ${table("account_merge_locks")} AS lock
       JOIN ${table("account_merge_operations")} AS operation
         ON operation.id = lock.operation_id
      WHERE lock.user_id = $1 AND lock.expires_at > now()
        AND operation.state IN ('confirmed', 'waiting', 'merging') LIMIT 1`,
    [userId],
  );
  if (result.rowCount) throw new AccountMergeError("merge_in_progress");
}

type NoticeRow = {
  id: string;
  email: string;
  name: string;
  event:
    | "merge_completed_primary"
    | "merge_completed_secondary"
    | "merge_timed_out"
    | "merge_failed";
  locale: "zh-CN" | "en-US";
  attempts: number;
};

export async function deliverAccountMergeNotices(input: {
  workerId?: string;
  now?: Date;
  limit?: number;
  deliver?: (notice: NoticeRow) => Promise<void>;
} = {}) {
  const now = input.now ?? new Date();
  const workerId = input.workerId ?? `merge-notice-${randomUUID()}`;
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const rows = await withTransaction(async (client) => {
    const claimed = await client.query<NoticeRow>(
      `WITH candidates AS (
         SELECT id FROM ${table("account_merge_notification_outbox")}
          WHERE recipient_email IS NOT NULL AND expires_at > $1
            AND attempts < $2
            AND (state = 'pending' OR (state = 'sending' AND lease_expires_at <= $1))
          ORDER BY created_at ASC, id ASC FOR UPDATE SKIP LOCKED LIMIT $3
       )
       UPDATE ${table("account_merge_notification_outbox")} AS notice
          SET state = 'sending', attempts = attempts + 1, lease_owner = $4,
              lease_expires_at = $5, updated_at = $1
         FROM candidates WHERE notice.id = candidates.id
       RETURNING notice.id, notice.recipient_email AS email,
                 notice.recipient_name AS name, notice.event, notice.locale,
                 notice.attempts`,
      [now, NOTICE_MAX_ATTEMPTS, limit, workerId, new Date(now.getTime() + NOTICE_LEASE_MS)],
    );
    await client.query(
      `UPDATE ${table("account_merge_notification_outbox")}
          SET state = 'failed', recipient_email = NULL, recipient_name = NULL,
              lease_owner = NULL, lease_expires_at = NULL, updated_at = $1
        WHERE recipient_email IS NOT NULL
          AND (expires_at <= $1 OR attempts >= $2) AND state <> 'delivered'`,
      [now, NOTICE_MAX_ATTEMPTS],
    );
    return claimed.rows;
  });

  let delivered = 0;
  let failed = 0;
  for (const notice of rows) {
    try {
      await (input.deliver?.(notice) ?? sendAccountSecurityNotice({
        email: notice.email,
        name: notice.name,
        event: notice.event,
        locale: notice.locale,
      }));
      await getDatabasePool().query(
        `UPDATE ${table("account_merge_notification_outbox")}
            SET state = 'delivered', delivered_at = $2,
                recipient_email = NULL, recipient_name = NULL,
                lease_owner = NULL, lease_expires_at = NULL, updated_at = $2
          WHERE id = $1 AND state = 'sending' AND lease_owner = $3`,
        [notice.id, now, workerId],
      );
      delivered += 1;
    } catch {
      const terminal = notice.attempts >= NOTICE_MAX_ATTEMPTS;
      await getDatabasePool().query(
        `UPDATE ${table("account_merge_notification_outbox")}
            SET state = $2, recipient_email = CASE WHEN $2 = 'failed' THEN NULL ELSE recipient_email END,
                recipient_name = CASE WHEN $2 = 'failed' THEN NULL ELSE recipient_name END,
                lease_owner = NULL, lease_expires_at = NULL, updated_at = $3
          WHERE id = $1 AND state = 'sending' AND lease_owner = $4`,
        [notice.id, terminal ? "failed" : "pending", now, workerId],
      );
      failed += 1;
    }
  }
  return { processed: rows.length, delivered, failed };
}
