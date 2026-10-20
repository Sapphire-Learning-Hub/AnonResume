import { randomUUID } from "node:crypto";
import { getDiagnosticContext } from "@/lib/observability/diagnostics/context";
import { handoffDiagnosticTask } from "@/lib/observability/diagnostics/store/runtime";
import { and, eq, isNull, or } from "drizzle-orm";
import { aiModels, aiProviderCredentials, aiResumeReviews, aiRuns, db, resumes } from "@/db";
import { buildReviewContext } from "@/domain/resume/ai/review/context";
import { reviewInputSchema, type AiReviewInput } from "@/domain/resume/ai/review/schema";
import { validateResumeDocument } from "@/domain/resume/validation";
import { assertAccountMergeMutationAllowed } from "@/lib/auth/account/merge/executor";
import { AiConversationNotFoundError } from "@/lib/ai/conversations/repository";
import { AiProviderError, type AiProviderRequest } from "@/lib/ai/providers/types";
import { aiProviderTimeoutPolicyFromSeconds } from "@/lib/ai/providers/timeout-policy";
import { decryptVersionedAiCredential } from "@/lib/ai/security/credentials";
import { reserveAiQuota, releaseAiQuota } from "@/lib/ai/usage/ledger";
import { calculateAiUsagePoints } from "@/lib/ai/usage/rates";
import { AiRunVersionConflictError, type AiRunConfiguration, type PreparedReviewRun } from "@/lib/ai/runs/service";
import { admitAiRun } from "@/lib/ai/runs/preparation";
import { encryptPreparedAiRunPayload } from "@/lib/ai/runs/run-payload";
import { createEncryptedAiAuditEvidence, storeAiAuditEvidence } from "@/lib/ai/audit/store";
import { createReviewTools, reviewMessages } from "./prompt";
import { estimateReviewInput } from "./budget";
import { REVIEW_EXECUTION_POLICY as policy } from "./policy";

export async function prepareResumeReviewRun(args: { userId: string; resumeId: string; input: AiReviewInput; configuration: AiRunConfiguration }): Promise<PreparedReviewRun> {
  const input = reviewInputSchema.parse(args.input);
  const now = new Date();
  await assertAccountMergeMutationAllowed(args.userId);
  const [resume] = await db.select().from(resumes).where(and(eq(resumes.id, args.resumeId), eq(resumes.userId, args.userId), isNull(resumes.deletedAt))).limit(1);
  if (!resume) throw new AiConversationNotFoundError();
  if (resume.version !== input.resumeVersion) throw new AiRunVersionConflictError(resume.version);
  const [row] = await db.select({ model: aiModels, provider: aiProviderCredentials }).from(aiModels).innerJoin(aiProviderCredentials, eq(aiProviderCredentials.id, aiModels.providerId)).where(and(
    eq(aiModels.id, input.modelId), eq(aiModels.enabled, true), isNull(aiModels.deletedAt), eq(aiProviderCredentials.enabled, true), isNull(aiProviderCredentials.deletedAt),
    or(isNull(aiProviderCredentials.ownerUserId), eq(aiProviderCredentials.ownerUserId, args.userId)),
  )).limit(1);
  if (!row || (row.provider.kind === "platform" && args.configuration.platformEnabled === false) || (row.provider.kind === "user" && args.configuration.byokEnabled === false)) throw new AiConversationNotFoundError();
  const document = validateResumeDocument(resume.document);
  const context = buildReviewContext(document);
  if (!context.targets.some((target) => target.blockPath.length && target.text.trim())) throw new AiProviderError("invalid_response");
  const runId = randomUUID();
  const reviewId = randomUUID();
  const messages = reviewMessages(context, input, row.model.supportsToolCalls);
  const tools = row.model.supportsToolCalls ? createReviewTools() : undefined;
  const promptBudget = estimateReviewInput({ messages, tools });
  if (promptBudget + Math.min(row.model.maxOutputTokens, policy.maxOutputPerRequest) > row.model.contextWindow) throw new AiProviderError("context_limit");
  const request: AiProviderRequest = {
    diagnosticRunId: runId, endpoint: new URL(row.provider.baseUrl),
    apiKey: decryptVersionedAiCredential(row.provider.encryptedApiKey, row.provider.encryptionKeyVersion, args.configuration.credentialKeys ?? { current: args.configuration.credentialsEncryptionKey, legacy: args.configuration.credentialsEncryptionKey }),
    model: row.model.providerModelKey, messages, maxOutputTokens: row.model.maxOutputTokens,
    timeoutPolicy: aiProviderTimeoutPolicyFromSeconds(row.model),
    allowCrossOriginRedirects: row.provider.allowCrossOriginRedirects,
    trustedEndpointHostnames: args.configuration.trustedEndpointHostnames,
    ...(tools ? { tools, toolChoice: "required" as const } : {}),
  };
  const rates = { inputPointsPerMillion: row.model.inputPointRate, cachedInputPointsPerMillion: row.model.cachedInputPointRate, outputPointsPerMillion: row.model.outputPointRate };
  const reservedPoints = row.provider.kind === "user" ? 0 : calculateAiUsagePoints({ inputTokens: policy.maxInputUnits, cachedInputTokens: 0, outputTokens: policy.maxOutputTokens, rates: { ...rates, inputPointsPerMillion: Math.max(rates.inputPointsPerMillion, rates.cachedInputPointsPerMillion) } });
  const auditRequest = { model: request.model, messages, tools: request.tools, promptVersion: 2, reviewProtocolVersion: policy.version };
  const prepared: PreparedReviewRun = { kind: "resume_review", reviewProtocolVersion: policy.version, reviewId, reviewInput: input, reviewContextWindow: row.model.contextWindow, reviewContext: context, runId, userId: args.userId, resumeId: args.resumeId, resumeVersion: input.resumeVersion, request, auditRequest, configuration: args.configuration, keySource: row.provider.kind, rates, rateCardVersion: row.model.rateCardVersion, reservationOperationId: runId, reservedPoints, proposalTargets: [], resumeDocument: document, providerContext: context };
  await admitAiRun({ userId: args.userId, resumeId: args.resumeId, configuration: args.configuration, now }, async (transaction) => {
    const [current] = await transaction.select({ version: resumes.version }).from(resumes).where(and(eq(resumes.id, args.resumeId), eq(resumes.userId, args.userId), isNull(resumes.deletedAt))).for("share").limit(1);
    if (!current) throw new AiConversationNotFoundError();
    if (current.version !== input.resumeVersion) throw new AiRunVersionConflictError(current.version);
    await transaction.insert(aiRuns).values({ id: runId, diagnosticContext: getDiagnosticContext() ?? null, kind: "resume_review", userId: args.userId, resumeId: args.resumeId, modelId: input.modelId, keySource: row.provider.kind, status: "preparing", resumeVersion: input.resumeVersion, contextHash: context.contentHash, promptVersion: 2, reservedPoints, leaseExpiresAt: new Date(now.getTime() + args.configuration.runLeaseSeconds * 1000) });
    await transaction.insert(aiResumeReviews).values({ id: reviewId, runId, input, context, modelName: row.model.displayName });
  });
  let reserved = false;
  try {
    await reserveAiQuota({ userId: args.userId, runId, operationId: runId, points: reservedPoints, monthlyLimit: args.configuration.defaultMonthlyPoints, modelId: input.modelId, rateCardVersion: row.model.rateCardVersion, now });
    reserved = true;
    await storeAiAuditEvidence({ runId, evidence: createEncryptedAiAuditEvidence({ request: auditRequest, response: null, encryptionKey: args.configuration.credentialsEncryptionKey, encryptionKeyVersion: 2, retentionDays: args.configuration.auditRetentionDays }) });
    const [queued] = await db.update(aiRuns).set({ status: "queued", encryptedExecutionPayload: encryptPreparedAiRunPayload(prepared, args.configuration.credentialsEncryptionKey), executionPayloadKeyVersion: 2, leaseExpiresAt: null }).where(and(eq(aiRuns.id, runId), eq(aiRuns.status, "preparing"), isNull(aiRuns.stopRequestedAt), isNull(aiRuns.leaseOwner))).returning({ id: aiRuns.id });
    if (!queued) throw new Error("ai_run_preparation_cancelled");
    handoffDiagnosticTask(runId, "ai");
    return prepared;
  } catch (error) {
    if (reserved) await releaseAiQuota({ userId: args.userId, runId, operationId: runId }).catch(() => undefined);
    await db.update(aiRuns).set({ status: "failed", failureCode: "preflight_failed", completedAt: new Date(), leaseExpiresAt: null }).where(and(eq(aiRuns.id, runId), eq(aiRuns.status, "preparing"), isNull(aiRuns.stopRequestedAt)));
    throw error;
  }
}
