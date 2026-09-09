import { sql } from "drizzle-orm";

import { db, pdfExportJobs, workerHeartbeats } from "@/db";

export const PDF_EXPORT_ACTIVE_POLL_MS = 2_000;
export const PDF_EXPORT_OFFLINE_POLL_MS = 30_000;
export const PDF_EXPORT_WORKER_STALE_MS = 10_000;

export async function getPdfExportWorkerAvailability(options: {
  now?: Date;
  staleAfterMs?: number;
} = {}) {
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? PDF_EXPORT_WORKER_STALE_MS;
  const staleBefore = new Date(now.getTime() - staleAfterMs);
  const result = await db.execute<{ available: boolean }>(sql`
    SELECT (
      EXISTS (
        SELECT 1
        FROM ${workerHeartbeats}
        WHERE ${workerHeartbeats.workerType} = 'pdf-export'
          AND ${workerHeartbeats.lastSeenAt} >= ${staleBefore}
      )
      OR EXISTS (
        SELECT 1
        FROM ${pdfExportJobs}
        WHERE ${pdfExportJobs.status} = 'running'
          AND ${pdfExportJobs.leaseExpiresAt} > ${now}
      )
    ) AS available
  `);

  return { available: result.rows[0]?.available ?? false };
}
