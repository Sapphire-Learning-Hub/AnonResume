import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { accountMergeLocks, aiRuns, db, resumes } from "@/db";
import { getLogger, serializeSafeError } from "@/lib/observability/logging";
import { databaseNow } from "@/lib/resume/transaction";
import { hasUnfinishedResumeTasks } from "./tasks";

const log = getLogger("anonresume.resume");

export async function processTrashedResumeStops(
  input: { limit?: number } = {},
) {
  const runs = await db
    .select({ userId: aiRuns.userId, runId: aiRuns.id })
    .from(aiRuns)
    .where(
      and(
        isNotNull(aiRuns.stopRequestedAt),
        inArray(aiRuns.status, ["queued", "preparing", "streaming"]),
      ),
    )
    .orderBy(asc(aiRuns.stopRequestedAt), asc(aiRuns.id))
    .limit(input.limit ?? 25);
  const { stopAiRun } = await import("@/lib/ai/runs/service");
  let failed = 0;
  for (const run of runs) {
    try {
      await stopAiRun(run);
    } catch (error) {
      failed++;
      log.error("trash_task_stop_failed", {
        transactionId: run.runId,
        error: serializeSafeError(error),
        outcome: "failure",
      });
    }
  }
  return { processed: runs.length, failed };
}

export async function runResumeTrashMaintenance(
  input: { now?: Date; limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const now = input.now ?? (await db.transaction(databaseNow));
  const candidates = await db
    .select({ id: resumes.id, userId: resumes.userId })
    .from(resumes)
    .where(and(isNotNull(resumes.deletedAt), lte(resumes.purgeAfter, now)))
    .orderBy(asc(resumes.purgeAfter), asc(resumes.id))
    .limit(limit);
  const result = { purged: 0, deferred: 0, failed: 0 };
  for (const candidate of candidates) {
    try {
      const outcome = await db.transaction(async (transaction) => {
        const [row] = await transaction
          .select({ id: resumes.id })
          .from(resumes)
          .where(
            and(
              eq(resumes.id, candidate.id),
              eq(resumes.userId, candidate.userId),
              isNotNull(resumes.deletedAt),
              lte(resumes.purgeAfter, now),
              sql`NOT EXISTS (SELECT 1 FROM ${accountMergeLocks} WHERE ${accountMergeLocks.userId} = ${resumes.userId} AND ${accountMergeLocks.expiresAt} > now())`,
            ),
          )
          .for("update", { skipLocked: true })
          .limit(1);
        if (!row) return "skipped";
        if (
          await hasUnfinishedResumeTasks(
            transaction,
            candidate.userId,
            candidate.id,
          )
        )
          return "deferred";
        await transaction
          .delete(resumes)
          .where(
            and(
              eq(resumes.userId, candidate.userId),
              eq(resumes.id, candidate.id),
            ),
          );
        return "purged";
      });
      if (outcome === "purged") result.purged++;
      else if (outcome === "deferred") result.deferred++;
    } catch (error) {
      result.failed++;
      log.error("trash_purge_failed", {
        error: serializeSafeError(error),
        outcome: "failure",
      });
    }
  }
  return result;
}
