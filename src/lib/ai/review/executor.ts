import { setTimeout as wait } from "node:timers/promises";
import { and, eq, gt, isNull } from "drizzle-orm";
import { aiRuns, db } from "@/db";
import { createReviewWorkspace } from "@/domain/resume/ai/review/workspace";
import type { ValidatedReviewReport, ReviewGrade } from "@/domain/resume/ai/review/schema";
import type { AiProviderAdapter } from "@/lib/ai/providers/types";
import { AiProviderError } from "@/lib/ai/providers/types";
import type { ClaimedReviewRun } from "@/lib/ai/runs/service";
import { activeRunControllers, startAiRunLeaseMonitor } from "@/lib/ai/runs/lifecycle";
import { finalizeOwnedAiRun } from "@/lib/ai/runs/finalize";
import type { AiClientStreamEvent, AiRunProgressStage } from "@/lib/ai/runs/stream-events";
import { calculateAiUsagePoints } from "@/lib/ai/usage/rates";
import { releaseAiQuota } from "@/lib/ai/usage/ledger";
import { createEncryptedAiAuditEvidence, replaceAiAuditEvidence } from "@/lib/ai/audit/store";
import { getLogger, serializeSafeError } from "@/lib/observability/logging";
import { withDiagnosticSpan } from "@/lib/observability/tracing/span";
import { createReviewBudget, type ReviewUsage } from "./budget";
import { REVIEW_EXECUTION_POLICY as policy, ReviewExecutionError } from "./policy";
import { reviewMessages, type ReviewExchange } from "./prompt";
import { collectReviewResponse, isReviewTimeout } from "./provider-attempt";
import { persistReviewCheckpoint } from "./checkpoint";

const log = getLogger("anonresume.ai");
const dimensionStages: Record<ReviewGrade["dimension"], AiRunProgressStage> = {
  completeness: "review_dimension_completeness", clarity: "review_dimension_clarity", impact: "review_dimension_impact",
  organization: "review_dimension_organization", consistency: "review_dimension_consistency",
};

export async function* executeResumeReviewRun(prepared: ClaimedReviewRun, options: { adapter: AiProviderAdapter; signal?: AbortSignal }): AsyncGenerator<AiClientStreamEvent> {
  if (options.signal?.aborted) return;
  if (prepared.reviewProtocolVersion !== policy.version) {
    const [unused] = await db.update(aiRuns).set({ status: "settlement_pending", failureCode: "execution_upgrade_required", completedAt: new Date(), encryptedExecutionPayload: null, executionPayloadKeyVersion: null, leaseOwner: null, leaseExpiresAt: null }).where(and(eq(aiRuns.id, prepared.runId), eq(aiRuns.status, "preparing"), eq(aiRuns.leaseOwner, prepared.leaseOwner), gt(aiRuns.leaseExpiresAt, new Date()), isNull(aiRuns.startedAt), isNull(aiRuns.stopRequestedAt))).returning({ id: aiRuns.id });
    if (unused) {
      await releaseAiQuota({ userId: prepared.userId, runId: prepared.runId, operationId: prepared.reservationOperationId });
      await db.update(aiRuns).set({ status: "failed", finalPoints: 0 }).where(and(eq(aiRuns.id, prepared.runId), eq(aiRuns.status, "settlement_pending"), eq(aiRuns.failureCode, "execution_upgrade_required")));
      yield { type: "error", sequence: 1, code: "execution_upgrade_required" };
    }
    return;
  }
  const started = new Date();
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  const [claimed] = await db.update(aiRuns).set({ status: "streaming", startedAt: started, updatedAt: started }).where(and(eq(aiRuns.id, prepared.runId), eq(aiRuns.kind, "resume_review"), eq(aiRuns.status, "preparing"), eq(aiRuns.leaseOwner, prepared.leaseOwner), gt(aiRuns.leaseExpiresAt, started), isNull(aiRuns.stopRequestedAt))).returning({ id: aiRuns.id });
  if (!claimed) { options.signal?.removeEventListener("abort", abort); return; }
  activeRunControllers.set(prepared.runId, controller);
  let leaseLost = false;
  const stopMonitor = startAiRunLeaseMonitor({ runId: prepared.runId, leaseOwner: prepared.leaseOwner, leaseSeconds: prepared.configuration.runLeaseSeconds, controller, intervalMs: Math.max(100, Math.min(1000, prepared.configuration.streamCheckpointMs)), onLeaseLost: () => { leaseLost = true; } });
  const totalTimeoutMs = prepared.request.timeoutPolicy?.totalTimeoutMs ?? 600000;
  const deadline = started.getTime() + totalTimeoutMs;
  const timeout = setTimeout(() => controller.abort(new ReviewExecutionError("review_deadline")), totalTimeoutMs);
  const workspace = createReviewWorkspace(prepared.reviewContext, prepared.reviewInput);
  const budget = createReviewBudget();
  let sequence = 0;
  let round = 0;
  let retries = 0;
  let corrections = 0;
  const progress: AiRunProgressStage[] = [];
  let usage: ReviewUsage | undefined;
  let usageComplete = true;
  let report: ValidatedReviewReport | undefined;
  let providerRequestId: string | undefined;
  let exchange: ReviewExchange | undefined;
  let lastError: string | undefined;
  let recentContent: Array<{ targetId: string; offset: number; text: string }> | undefined;
  const responses: unknown[] = [];
  function evidence(failureCode?: string) {
    return createEncryptedAiAuditEvidence({ request: prepared.auditRequest, response: { attempts: responses, usage, usageComplete, report, failureCode }, encryptionKey: prepared.configuration.credentialsEncryptionKey, encryptionKeyVersion: 2, retentionDays: prepared.configuration.auditRetentionDays });
  }
  async function checkpoint(value?: AiRunProgressStage): Promise<AiClientStreamEvent> {
    if (value) {
      const index = progress.indexOf(value);
      if (index >= 0) progress.splice(index, 1);
      progress.push(value);
    }
    sequence += 1;
    const owned = await persistReviewCheckpoint({ prepared, sequence, progress, state: workspace.snapshot(), usage, usageComplete, budget: budget.snapshot(), round, retries, corrections, providerRequestId, audit: evidence() });
    if (!owned) { leaseLost = true; throw new Error("ai_run_lease_lost"); }
    return { type: "progress", sequence, stage: value ?? progress.at(-1) ?? "analyzing_resume" };
  }
  function settlement() {
    if (!usage || !usageComplete) return undefined;
    const actualPoints = prepared.keySource === "user" ? 0 : calculateAiUsagePoints({ ...usage, rates: prepared.rates });
    if (actualPoints > prepared.reservedPoints) return undefined;
    return { userId: prepared.userId, runId: prepared.runId, operationId: prepared.reservationOperationId, actualPoints, ...usage };
  }
  try {
    yield await checkpoint("analyzing_resume");
    for (; round < policy.maxRounds; round += 1) {
      let response: Awaited<ReturnType<typeof collectReviewResponse>> | undefined;
      for (;;) {
        controller.signal.throwIfAborted();
        await checkpoint();
        controller.signal.throwIfAborted();
        const request = budget.prepare({ ...prepared.request, messages: reviewMessages(prepared.reviewContext, prepared.reviewInput, Boolean(prepared.request.tools), { ...workspace.summary(), recentContent: exchange?.action === "read_review_content" ? undefined : recentContent, lastError, remainingRounds: policy.maxRounds - round }, exchange) }, prepared.reviewContextWindow, deadline - Date.now());
        let roundUsage: ReviewUsage | undefined;
        let failure: unknown;
        providerRequestId = undefined;
        try {
          response = await withDiagnosticSpan("app.ai.review.round", () => collectReviewResponse({ adapter: options.adapter, request, signal: controller.signal, onRequestId: (id) => { providerRequestId = id; }, onUsage: (value) => { roundUsage = { inputTokens: value.inputTokens, cachedInputTokens: value.cachedInputTokens, outputTokens: value.outputTokens }; } }), { "app.attempt": budget.snapshot().attempts });
        } catch (error) { failure = error; }
        finally {
          budget.recordUsage(roundUsage);
          if (roundUsage) usage = { inputTokens: (usage?.inputTokens ?? 0) + roundUsage.inputTokens, cachedInputTokens: (usage?.cachedInputTokens ?? 0) + roundUsage.cachedInputTokens, outputTokens: (usage?.outputTokens ?? 0) + roundUsage.outputTokens };
          else usageComplete = false;
        }
        responses.push({ round, attempt: budget.snapshot().attempts, providerRequestId, usage: roundUsage, ...(failure ? { failureCode: failure instanceof AiProviderError ? failure.code : "request_failed" } : { response: response!.raw }) });
        const counters = budget.snapshot();
        if (counters.inputUnits > policy.maxInputUnits || counters.outputUnits > policy.maxOutputTokens) throw new ReviewExecutionError("review_budget_exceeded");
        if (!failure) break;
        if (failure instanceof AiProviderError && failure.code === "invalid_response" && !controller.signal.aborted) {
          response = { action: undefined, callId: "invalid-action", raw: "" };
          break;
        }
        if (!isReviewTimeout(failure) || controller.signal.aborted || retries >= policy.maxTimeoutRetries) throw failure;
        const delayMs = (retries + 1) * 1000;
        if (deadline - Date.now() < delayMs + 1000) throw failure;
        retries += 1;
        log.warn("resume_review_retrying", { transactionId: prepared.runId, outcome: "failure", labels: { failureCode: "timeout", timeoutPhase: failure.diagnostics?.timeoutPhase ?? "unknown", attempt: counters.attempts, retries, round } });
        yield await checkpoint("retrying_upstream");
        try { await wait(delayMs, undefined, { signal: controller.signal }); }
        catch { controller.signal.throwIfAborted(); }
        controller.signal.throwIfAborted();
        yield await checkpoint("analyzing_resume");
      }
      controller.signal.throwIfAborted();
      const action = response!.action;
      const result = action ? workspace.execute(action) : { ok: false as const, error: "invalid_action" as const };
      exchange = action ? { callId: response!.callId, action: action.action, arguments: JSON.stringify(action.arguments), result } : undefined;
      if (!result.ok) {
        lastError = result.error;
        corrections += 1;
        if (corrections > policy.maxCorrections) throw new AiProviderError("invalid_response");
        yield await checkpoint("repairing_changes");
        continue;
      }
      lastError = undefined;
      if (result.content) recentContent = result.content;
      if (result.report) { report = result.report; break; }
      const stage: AiRunProgressStage = action?.action === "submit_review_dimension" ? dimensionStages[action.arguments.dimension] : action?.action === "read_review_content" ? "review_reading" : action?.action === "submit_review_match" ? "review_matching" : "analyzing_resume";
      yield await checkpoint(stage);
    }
    if (!report) throw new ReviewExecutionError("review_round_limit");
    controller.signal.throwIfAborted();
    yield await checkpoint("saving_result");
    const finished = await finalizeOwnedAiRun({ kind: "resume_review", runId: prepared.runId, leaseOwner: prepared.leaseOwner, sequence, text: "", proposalText: "", review: { id: prepared.reviewId, report }, providerRequestId, usage, settlement: settlement() });
    if (!finished) { leaseLost = true; throw new Error("ai_run_lease_lost"); }
    log.info("resume_review_completed", { outcome: "success", transactionId: prepared.runId, durationNs: (Date.now() - started.getTime()) * 1000000, labels: { attempts: budget.snapshot().attempts, rounds: round + 1, retries } });
    yield { sequence: ++sequence, type: "complete", finishReason: null };
  } catch (error) {
    if (leaseLost || options.signal?.aborted) throw error;
    const reason = controller.signal.aborted ? controller.signal.reason : error;
    const failureCode = reason instanceof ReviewExecutionError || reason instanceof AiProviderError ? reason.code : controller.signal.aborted ? "stopped" : "review_failed";
    const safelyUnused = !usage && (budget.snapshot().attempts === 0 || (budget.snapshot().attempts === 1 && error instanceof AiProviderError && ["authentication", "rate_limited"].includes(error.code)));
    await replaceAiAuditEvidence({ runId: prepared.runId, evidence: evidence(failureCode) }).catch((auditError: unknown) => log.error("resume_review_audit_failed", { error: serializeSafeError(auditError), transactionId: prepared.runId, outcome: "failure" }));
    await finalizeOwnedAiRun({ kind: "resume_review", runId: prepared.runId, leaseOwner: prepared.leaseOwner, sequence, text: "", proposalText: "", providerRequestId, failureCode, usage, settlement: settlement() });
    if (safelyUnused) {
      await releaseAiQuota({ userId: prepared.userId, runId: prepared.runId, operationId: prepared.reservationOperationId });
      await db.update(aiRuns).set({ status: "failed", finalPoints: 0 }).where(and(eq(aiRuns.id, prepared.runId), eq(aiRuns.status, "settlement_pending"), eq(aiRuns.failureCode, failureCode)));
    }
    log.error("resume_review_failed", { error: serializeSafeError(error), outcome: "failure", transactionId: prepared.runId, labels: { failureCode, timeoutPhase: error instanceof AiProviderError ? error.diagnostics?.timeoutPhase ?? "none" : "none", attempts: budget.snapshot().attempts, round, retries } });
    yield { sequence: ++sequence, type: "error", code: failureCode };
  } finally {
    activeRunControllers.delete(prepared.runId);
    clearTimeout(timeout);
    stopMonitor();
    options.signal?.removeEventListener("abort", abort);
  }
}
