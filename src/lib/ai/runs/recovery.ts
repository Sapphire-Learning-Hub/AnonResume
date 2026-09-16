import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

export { getAiRunSnapshot, stopAiRun } from "./service";

interface ExpiredRunRow {
  id: string;
  userId: string;
  assistantMessageId: string;
  reservedPoints: string;
  startedAt: Date | null;
  providerRequestId: string | null;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function table(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

function validateBatchSize(batchSize: number) {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0 || batchSize > 1_000) {
    throw new Error("invalid_ai_maintenance_batch_size");
  }
}

async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function releaseUnusedReservation(
  client: PoolClient,
  run: ExpiredRunRow,
) {
  const reservation = await client.query<{ points: string }>(
    `SELECT points_delta::text AS points
       FROM ${table("ai_usage_ledger")}
      WHERE user_id = $1 AND entry_type = 'reserve'
        AND metadata ->> 'operationId' = $2
      LIMIT 1`,
    [run.userId, run.id],
  );
  if (!reservation.rows[0]) return null;
  const points = Number(reservation.rows[0].points);
  const account = await client.query<{ reservedPoints: string }>(
    `SELECT reserved_points::text AS "reservedPoints"
       FROM ${table("ai_quota_accounts")}
      WHERE user_id = $1 FOR UPDATE`,
    [run.userId],
  );
  if (!account.rows[0] || Number(account.rows[0].reservedPoints) < points) {
    return null;
  }

  await client.query(
    `UPDATE ${table("ai_quota_accounts")}
        SET reserved_points = reserved_points - $2, updated_at = now()
      WHERE user_id = $1`,
    [run.userId, points],
  );
  await client.query(
    `INSERT INTO ${table("ai_usage_ledger")}
       (user_id, run_id, entry_type, points_delta, metadata)
     VALUES ($1, $2, 'release', $3, $4::jsonb)`,
    [
      run.userId,
      run.id,
      -points,
      JSON.stringify({ operationId: run.id, reason: "expired_unused_lease" }),
    ],
  );
  return points;
}

export async function recoverExpiredAiRuns({
  now = new Date(),
  batchSize = 100,
}: {
  now?: Date;
  batchSize?: number;
} = {}) {
  validateBatchSize(batchSize);
  return withTransaction(async (client) => {
    const expired = await client.query<ExpiredRunRow>(
      `SELECT id::text, user_id AS "userId",
              assistant_message_id::text AS "assistantMessageId",
              reserved_points::text AS "reservedPoints",
              started_at AS "startedAt", provider_request_id AS "providerRequestId"
         FROM ${table("ai_runs")}
        WHERE status IN ('preparing', 'streaming')
          AND lease_expires_at IS NOT NULL AND lease_expires_at <= $1
        ORDER BY lease_expires_at ASC, id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [now, batchSize],
    );
    let interrupted = 0;
    let settlementPending = 0;
    let releasedPoints = 0;

    for (const run of expired.rows) {
      const provablyUnused = !run.startedAt && !run.providerRequestId;
      const released = provablyUnused
        ? await releaseUnusedReservation(client, run)
        : null;
      const status = released === null ? "settlement_pending" : "interrupted";
      await client.query(
        `UPDATE ${table("ai_runs")}
            SET status = $2,
                final_points = CASE WHEN $2 = 'interrupted' THEN 0 ELSE final_points END,
                failure_code = 'lease_expired', completed_at = $3, updated_at = $3,
                lease_owner = NULL, lease_expires_at = NULL
          WHERE id = $1`,
        [run.id, status, now],
      );
      await client.query(
        `UPDATE ${table("ai_messages")}
            SET completion_state = 'failed', updated_at = $2
          WHERE id = $1`,
        [run.assistantMessageId, now],
      );
      if (status === "interrupted") {
        interrupted += 1;
        releasedPoints += released ?? 0;
      } else {
        settlementPending += 1;
      }
    }

    return { interrupted, settlementPending, releasedPoints };
  });
}

export async function renewExpiredAiQuotaPeriods({
  now = new Date(),
  batchSize = 100,
}: {
  now?: Date;
  batchSize?: number;
} = {}) {
  validateBatchSize(batchSize);
  return withTransaction(async (client) => {
    const expired = await client.query<{ userId: string }>(
      `SELECT user_id AS "userId"
         FROM ${table("ai_quota_accounts")}
        WHERE period_ends_at <= $1 AND reserved_points = 0
        ORDER BY period_ends_at ASC, user_id ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [now, batchSize],
    );
    const periodEndsAt = new Date(now);
    periodEndsAt.setUTCMonth(periodEndsAt.getUTCMonth() + 1);
    for (const account of expired.rows) {
      await client.query(
        `UPDATE ${table("ai_quota_accounts")}
            SET period_started_at = $2, period_ends_at = $3,
                used_points = 0, updated_at = $2
          WHERE user_id = $1`,
        [account.userId, now, periodEndsAt],
      );
      await client.query(
        `INSERT INTO ${table("ai_usage_ledger")}
           (user_id, entry_type, points_delta, metadata)
         VALUES ($1, 'renewal', 0, $2::jsonb)`,
        [account.userId, JSON.stringify({ periodStartedAt: now })],
      );
    }
    return expired.rowCount ?? 0;
  });
}
