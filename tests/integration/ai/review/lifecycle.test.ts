import { eq } from "drizzle-orm";
import { aiQuotaAccounts, aiResumeReviews, aiRuns, db } from "@/db";
import { prepareResumeReviewRun } from "@/lib/ai/review/service";
import { claimQueuedAiRuns } from "@/lib/ai/runs/queue";
import { recoverExpiredAiRuns } from "@/lib/ai/runs/recovery";
import { executePreparedAiRun, stopAiRun } from "@/lib/ai/runs/service";
import { createReviewFixture, reviewAdapter } from "../../../support/ai-review";

it("recovers an unused message-free lease and prevents the expired worker from committing", async () => {
  const fixture = await createReviewFixture();
  try {
    const run = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "expired-review", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    await db.update(aiRuns).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(aiRuns.id, run.runId));
    expect(await recoverExpiredAiRuns()).toMatchObject({ interrupted: 1 });
    const start = vi.fn(async function* () { yield { type: "complete" as const, finishReason: "stop" }; });
    for await (const event of executePreparedAiRun(claimed!, { adapter: { start } })) void event;
    expect(start).not.toHaveBeenCalled();
    const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, run.reviewId));
    const [quota] = await db.select().from(aiQuotaAccounts).where(eq(aiQuotaAccounts.userId, fixture.userId));
    expect(review?.report).toBeNull();
    expect(quota?.reservedPoints).toBe(0);
  } finally { await fixture.cleanup(); }
});

it("does not publish a late report after the owner stops a streaming review", async () => {
  const fixture = await createReviewFixture();
  try {
    const run = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "stopped-review", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    const adapter = reviewAdapter();
    for await (const event of executePreparedAiRun(claimed!, { adapter: { async *start(request, signal) {
      await stopAiRun({ userId: fixture.userId, runId: run.runId });
      yield* adapter.start(request, signal);
    } } })) void event;
    const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, run.reviewId));
    const [stopped] = await db.select().from(aiRuns).where(eq(aiRuns.id, run.runId));
    expect(review?.report).toBeNull();
    expect(stopped).toMatchObject({ status: "settlement_pending", failureCode: "stopped", finalPoints: null });
  } finally { await fixture.cleanup(); }
});
