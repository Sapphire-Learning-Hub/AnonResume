import { eq } from "drizzle-orm";
import { aiResumeReviews, aiRuns, db } from "@/db";
import { AiProviderError, type AiProviderAdapter } from "@/lib/ai/providers/types";
import { prepareResumeReviewRun } from "@/lib/ai/review/service";
import { claimQueuedAiRuns } from "@/lib/ai/runs/queue";
import { executePreparedAiRun, stopAiRun } from "@/lib/ai/runs/service";
import { createReviewFixture, reviewAdapter } from "../../../support/ai-review";

async function queuedReview() {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "timeout-review", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    if (claimed?.kind !== "resume_review") throw new Error("missing_review");
    return { ...fixture, prepared, claimed };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}

it("retries two upstream timeouts, discards partial reports and settles usage from every attempt", async () => {
  const fixture = await queuedReview();
  let attempts = 0;
  const success = reviewAdapter();
  const adapter: AiProviderAdapter = { async *start(request, signal) {
    attempts += 1;
    if (attempts < 3) {
      yield { type: "tool_call", callId: `call-${attempts}`, name: "submit_review_dimension", arguments: "partial invalid report" };
      yield { type: "usage", inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200 };
      throw new AiProviderError("timeout", { timeoutPhase: "stream_idle" });
    }
    yield* success.start(request, signal);
  } };
  try {
    const events = [];
    for await (const event of executePreparedAiRun(fixture.claimed, { adapter })) events.push(event);
    expect(attempts).toBe(9);
    expect(events.filter((event) => event.type === "progress" && event.stage === "retrying_upstream")).toHaveLength(2);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, fixture.prepared.runId));
    const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, fixture.prepared.reviewId));
    expect(run).toMatchObject({ status: "complete", failureCode: null, inputTokens: 9000, outputTokens: 1800, finalPoints: 11 });
    expect(review?.report?.score).toBe(75);
  } finally { await fixture.cleanup(); }
});

it("ends after three timed-out requests and preserves the reason for historical reports", async () => {
  const fixture = await queuedReview();
  let attempts = 0;
  const adapter: AiProviderAdapter = { async *start() {
    attempts += 1;
    throw new AiProviderError("timeout", { timeoutPhase: "connection" });
  } };
  try {
    const events = [];
    for await (const event of executePreparedAiRun(fixture.claimed, { adapter })) events.push(event);
    expect(attempts).toBe(3);
    expect(events.at(-1)).toMatchObject({ type: "error", code: "timeout" });
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, fixture.prepared.runId));
    const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, fixture.prepared.reviewId));
    expect(run).toMatchObject({ status: "settlement_pending", failureCode: "timeout", finalPoints: null });
    expect(review?.report).toBeNull();
  } finally { await fixture.cleanup(); }
});

it("keeps known usage without pretending a timed-out request with unknown usage was free", async () => {
  const fixture = await queuedReview();
  let attempts = 0;
  const success = reviewAdapter();
  const adapter: AiProviderAdapter = { async *start(request, signal) {
    attempts += 1;
    if (attempts === 1) throw new AiProviderError("timeout", { timeoutPhase: "first_chunk" });
    yield* success.start(request, signal);
  } };
  try {
    for await (const event of executePreparedAiRun(fixture.claimed, { adapter })) void event;
    expect(attempts).toBe(8);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, fixture.prepared.runId));
    const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, fixture.prepared.reviewId));
    expect(run).toMatchObject({ status: "settlement_pending", inputTokens: 7000, outputTokens: 1400, finalPoints: null });
    expect(review?.report?.score).toBe(75);
  } finally { await fixture.cleanup(); }
});

it("does not retry when the total deadline cannot accommodate the backoff and another request", async () => {
  const fixture = await queuedReview();
  fixture.claimed.request.timeoutPolicy = { connectionTimeoutMs: 100, firstChunkTimeoutMs: 100, streamIdleTimeoutMs: 100, totalTimeoutMs: 1800 };
  let attempts = 0;
  const adapter: AiProviderAdapter = { async *start() {
    attempts += 1;
    throw new AiProviderError("timeout", { timeoutPhase: "connection" });
  } };
  try {
    for await (const event of executePreparedAiRun(fixture.claimed, { adapter })) void event;
    expect(attempts).toBe(1);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, fixture.prepared.runId));
    expect(run?.failureCode).toBe("timeout");
  } finally { await fixture.cleanup(); }
});

it("honors a user stop during retry backoff without sending another request", async () => {
  const fixture = await queuedReview();
  let attempts = 0;
  const adapter: AiProviderAdapter = { async *start() {
    attempts += 1;
    throw new AiProviderError("timeout", { timeoutPhase: "connection" });
  } };
  try {
    let stopped = false;
    for await (const event of executePreparedAiRun(fixture.claimed, { adapter })) {
      if (event.type === "progress" && event.stage === "retrying_upstream") {
        stopped = await stopAiRun({ userId: fixture.userId, runId: fixture.prepared.runId }) === true;
      }
    }
    expect(stopped).toBe(true);
    expect(attempts).toBe(1);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, fixture.prepared.runId));
    expect(run).toMatchObject({ failureCode: "stopped", status: "settlement_pending" });
  } finally { await fixture.cleanup(); }
});

it("does not retry after losing the task lease during backoff", async () => {
  const fixture = await queuedReview();
  let attempts = 0;
  const adapter: AiProviderAdapter = { async *start() {
    attempts += 1;
    throw new AiProviderError("timeout", { timeoutPhase: "connection" });
  } };
  try {
    await expect((async () => {
      for await (const event of executePreparedAiRun(fixture.claimed, { adapter })) {
        if (event.type === "progress" && event.stage === "retrying_upstream") {
          await db.update(aiRuns).set({ leaseExpiresAt: new Date(0) }).where(eq(aiRuns.id, fixture.prepared.runId));
        }
      }
    })()).rejects.toThrow("ai_run_lease_lost");
    expect(attempts).toBe(1);
    const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, fixture.prepared.reviewId));
    expect(review?.report).toBeNull();
  } finally { await fixture.cleanup(); }
});

it("does not retry authentication errors", async () => {
  const fixture = await queuedReview();
  let attempts = 0;
  const adapter: AiProviderAdapter = { async *start() {
    attempts += 1;
    throw new AiProviderError("authentication");
  } };
  try {
    for await (const event of executePreparedAiRun(fixture.claimed, { adapter })) void event;
    expect(attempts).toBe(1);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, fixture.prepared.runId));
    expect(run).toMatchObject({ status: "failed", failureCode: "authentication", finalPoints: 0 });
  } finally { await fixture.cleanup(); }
});

it("does not release unknown earlier usage when a later retry fails authentication", async () => {
  const fixture = await queuedReview();
  let attempts = 0;
  try {
    for await (const event of executePreparedAiRun(fixture.claimed, { adapter: { async *start() {
      attempts += 1;
      throw new AiProviderError(attempts === 1 ? "timeout" : "authentication");
    } } })) void event;
    expect(attempts).toBe(2);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, fixture.prepared.runId));
    expect(run).toMatchObject({ status: "settlement_pending", failureCode: "authentication", finalPoints: null });
  } finally { await fixture.cleanup(); }
});

it("uses one overall deadline and does not retry a request cancelled by it", async () => {
  const fixture = await queuedReview();
  fixture.claimed.request.timeoutPolicy = { connectionTimeoutMs: 100, firstChunkTimeoutMs: 100, streamIdleTimeoutMs: 100, totalTimeoutMs: 100 };
  let attempts = 0;
  try {
    for await (const event of executePreparedAiRun(fixture.claimed, { adapter: { async *start(_request, signal) {
      attempts += 1;
      await new Promise<void>((resolve) => {
        if (signal.aborted) resolve();
        else signal.addEventListener("abort", () => resolve(), { once: true });
      });
      throw new AiProviderError("aborted");
    } } })) void event;
    expect(attempts).toBe(1);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, fixture.prepared.runId));
    expect(run?.failureCode).toBe("review_deadline");
  } finally { await fixture.cleanup(); }
});
