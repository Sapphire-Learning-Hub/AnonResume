import { sql } from "drizzle-orm";

import { aiRuns, db, workerHeartbeats } from "@/db";

export const AI_WORKER_STALE_MS = 15_000;

export async function getAiWorkerAvailability(options: {
  now?: Date;
  staleAfterMs?: number;
} = {}) {
  const now = options.now ?? new Date();
  const staleBefore = new Date(
    now.getTime() - (options.staleAfterMs ?? AI_WORKER_STALE_MS),
  );
  const result = await db.execute<{ available: boolean }>(sql`
    SELECT (
      EXISTS (
        SELECT 1
        FROM ${workerHeartbeats}
        WHERE ${workerHeartbeats.workerType} = 'ai-runtime'
          AND ${workerHeartbeats.lastSeenAt} >= ${staleBefore}
      )
      OR EXISTS (
        SELECT 1
        FROM ${aiRuns}
        WHERE ${aiRuns.status} IN ('preparing', 'streaming')
          AND ${aiRuns.leaseExpiresAt} > ${now}
      )
    ) AS available
  `);

  return { available: result.rows[0]?.available ?? false };
}
