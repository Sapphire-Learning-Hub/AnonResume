import { eq } from "drizzle-orm";
import { aiModels, aiResumeReviews, aiRuns, db } from "@/db";
import { decryptVersionedAiCredential } from "@/lib/ai/security/credentials";
import { prepareResumeReviewRun } from "@/lib/ai/review/service";
import { executePreparedAiRun, stopAiRun } from "@/lib/ai/runs/service";
import { claimQueuedAiRuns } from "@/lib/ai/runs/queue";
import { AiProviderError } from "@/lib/ai/providers/types";
import { reviewActions, reviewAdapter, createReviewFixture } from "../../../support/ai-review";

it.each([false, true])("completes a multi-round review with json=%s and settles every request", async (json) => {
  const fixture = await createReviewFixture();
  if (json) await db.update(aiModels).set({ supportsToolCalls: false }).where(eq(aiModels.id, fixture.modelId));
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "review-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    const adapter = reviewAdapter({ json });
    let requests = 0;
    const events = [];
    for await (const event of executePreparedAiRun(claimed!, { adapter: { async *start(request, signal) {
      requests += 1;
      expect(request.maxOutputTokens).toBeLessThanOrEqual(2048);
      yield* adapter.start(request, signal);
    } } })) events.push(event);
    expect(requests).toBe(7);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
    const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, prepared.reviewId));
    expect(run).toMatchObject({ status: "complete", inputTokens: 7000, outputTokens: 1400, finalPoints: 9 });
    expect(review?.report).toMatchObject({ score: 75, schemaVersion: 1 });
    expect(events.some((event) => event.type === "text_delta" || event.type === "proposal_delta")).toBe(false);
  } finally { await fixture.cleanup(); }
});

it("persists private per-round checkpoints without exposing a partial report", async () => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "checkpoint-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    let observed = false;
    for await (const event of executePreparedAiRun(claimed!, { adapter: reviewAdapter() })) {
      if (event.type !== "progress" || event.stage !== "review_dimension_completeness") continue;
      const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
      const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, prepared.reviewId));
      expect(review?.report).toBeNull();
      const checkpoint = run!.encryptedExecutionPayload!;
      expect(checkpoint.toString()).not.toContain("Some details can be clearer");
      const decoded: unknown = JSON.parse(decryptVersionedAiCredential(checkpoint, 2, { current: fixture.configuration.credentialsEncryptionKey, legacy: fixture.configuration.credentialsEncryptionKey }));
      expect(decoded).toMatchObject({ version: 1, kind: "review_checkpoint", state: { dimensions: [{ dimension: "completeness" }] }, usage: { inputTokens: 2000 } });
      observed = true;
    }
    expect(observed).toBe(true);
  } finally { await fixture.cleanup(); }
});

it("corrects invalid actions without publishing unvalidated content", async () => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "correction-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    const actions = reviewActions();
    const adapter = reviewAdapter({ actions: [actions.at(-1)!, ...actions] });
    for await (const event of executePreparedAiRun(claimed!, { adapter })) void event;
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({ status: "complete", inputTokens: 8000, finalPoints: 10 });
  } finally { await fixture.cleanup(); }
});

it.each(["multiple", "truncated"])("rejects %s responses without applying their partial actions", async (mode) => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "invalid-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    let calls = 0;
    for await (const event of executePreparedAiRun(claimed!, { adapter: { async *start() {
      calls += 1;
      yield { type: "tool_call", callId: "partial", name: "submit_review_dimension", arguments: JSON.stringify({ dimension: "completeness", grade: 3, reason: "Never apply" }) };
      if (mode === "multiple") yield { type: "tool_call", callId: "extra", name: "read_review_content", arguments: "{}" };
      yield { type: "usage", inputTokens: 100, cachedInputTokens: 0, outputTokens: 50 };
      yield { type: "complete", finishReason: mode === "multiple" ? "tool_calls" : "length" };
    } } })) void event;
    expect(calls).toBe(3);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
    const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, prepared.reviewId));
    expect(run).toMatchObject({ status: mode === "multiple" ? "settlement_pending" : "failed", failureCode: "invalid_response", inputTokens: mode === "multiple" ? null : 300 });
    expect(run?.checkpointProgress).not.toContain("review_dimension_completeness");
    expect(review?.report).toBeNull();
  } finally { await fixture.cleanup(); }
});

it("bounds action rounds even for valid but unproductive reads", async () => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "round-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    let calls = 0;
    const adapter = reviewAdapter({ actions: [reviewActions()[0]!] });
    for await (const event of executePreparedAiRun(claimed!, { adapter: { async *start(request, signal) { calls += 1; yield* adapter.start(request, signal); } } })) void event;
    expect(calls).toBe(32);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
    expect(run?.failureCode).toBe("review_round_limit");
  } finally { await fixture.cleanup(); }
});

it("rejects legacy review execution before making a provider call and releases the unused reservation", async () => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "legacy-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    if (claimed?.kind !== "resume_review") throw new Error("missing_review");
    claimed.reviewProtocolVersion = undefined;
    const start = vi.fn(reviewAdapter().start);
    for await (const event of executePreparedAiRun(claimed, { adapter: { start } })) void event;
    expect(start).not.toHaveBeenCalled();
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({ status: "failed", failureCode: "execution_upgrade_required", finalPoints: 0 });
  } finally { await fixture.cleanup(); }
});

it("stops an unstarted review without making a provider request", async () => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    expect(await stopAiRun({ userId: fixture.userId, runId: prepared.runId })).toBe(true);
    expect(await claimQueuedAiRuns({ workerId: "stop-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey })).toEqual([]);
  } finally { await fixture.cleanup(); }
});

it("checks database ownership before every new call even before the heartbeat monitor observes a stop", async () => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "ownership-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    const adapter = reviewAdapter();
    let requests = 0;
    await expect((async () => {
      for await (const event of executePreparedAiRun(claimed!, { adapter: { async *start(request, signal) { requests += 1; yield* adapter.start(request, signal); } } })) {
        if (event.type === "progress" && event.stage === "review_reading") {
          await db.update(aiRuns).set({ status: "settlement_pending", stopRequestedAt: new Date(), failureCode: "stopped", leaseOwner: null, leaseExpiresAt: null }).where(eq(aiRuns.id, prepared.runId));
        }
      }
    })()).rejects.toThrow("ai_run_lease_lost");
    expect(requests).toBe(1);
    const [review] = await db.select().from(aiResumeReviews).where(eq(aiResumeReviews.id, prepared.reviewId));
    expect(review?.report).toBeNull();
  } finally { await fixture.cleanup(); }
});

it("offers bounded correction when the provider rejects a malformed tool protocol", async () => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "protocol-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    const adapter = reviewAdapter();
    let requests = 0;
    for await (const event of executePreparedAiRun(claimed!, { adapter: { async *start(request, signal) {
      requests += 1;
      if (requests === 1) {
        yield { type: "usage", inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200 };
        throw new AiProviderError("invalid_response", { protocolViolation: "missing_tool_payload" });
      }
      yield* adapter.start(request, signal);
    } } })) void event;
    expect(requests).toBe(8);
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({ status: "complete", inputTokens: 8000, finalPoints: 10 });
  } finally { await fixture.cleanup(); }
});

it("releases reservation when execution preflight refuses context before any provider call", async () => {
  const fixture = await createReviewFixture();
  try {
    const prepared = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const [claimed] = await claimQueuedAiRuns({ workerId: "capacity-worker", limit: 1, leaseSeconds: 90, encryptionKey: fixture.configuration.credentialsEncryptionKey });
    if (claimed?.kind !== "resume_review") throw new Error("missing_review");
    claimed.reviewContextWindow = 1;
    const start = vi.fn(reviewAdapter().start);
    for await (const event of executePreparedAiRun(claimed, { adapter: { start } })) void event;
    expect(start).not.toHaveBeenCalled();
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({ status: "failed", failureCode: "context_limit", finalPoints: 0 });
  } finally { await fixture.cleanup(); }
});
