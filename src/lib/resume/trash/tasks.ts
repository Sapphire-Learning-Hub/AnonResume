import { and, eq, inArray, sql } from "drizzle-orm";
import { aiRuns, pdfExportJobs } from "@/db";
import type { ResumeTransaction } from "@/lib/resume/transaction";

export async function requestResumeTaskStops(
  transaction: ResumeTransaction,
  input: { userId: string; resumeId: string; now: Date },
) {
  await transaction
    .update(pdfExportJobs)
    .set({
      cancelRequested: true,
      status: sql`CASE WHEN ${pdfExportJobs.status} = 'queued' THEN 'cancelled' ELSE ${pdfExportJobs.status} END`,
      result: null,
      accessTokenHash: "",
      resultExpiresAt: input.now,
    })
    .where(
      and(
        eq(pdfExportJobs.resumeUserId, input.userId),
        eq(pdfExportJobs.resumeId, input.resumeId),
      ),
    );
  await transaction
    .update(aiRuns)
    .set({ stopRequestedAt: input.now, updatedAt: input.now })
    .where(
      and(
        eq(aiRuns.userId, input.userId),
        eq(aiRuns.resumeId, input.resumeId),
        inArray(aiRuns.status, ["queued", "preparing", "streaming"]),
      ),
    );
}

export async function hasUnfinishedResumeTasks(
  transaction: ResumeTransaction,
  userId: string,
  resumeId: string,
) {
  const [pdf] = await transaction
    .select({ id: pdfExportJobs.id })
    .from(pdfExportJobs)
    .where(
      and(
        eq(pdfExportJobs.resumeUserId, userId),
        eq(pdfExportJobs.resumeId, resumeId),
        inArray(pdfExportJobs.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  const [ai] = await transaction
    .select({ id: aiRuns.id })
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.userId, userId),
        eq(aiRuns.resumeId, resumeId),
        inArray(aiRuns.status, [
          "queued",
          "preparing",
          "streaming",
          "settlement_pending",
        ]),
      ),
    )
    .limit(1);
  return Boolean(pdf || ai);
}
