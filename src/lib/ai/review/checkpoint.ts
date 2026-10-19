import { and, eq, gt, isNull } from "drizzle-orm";
import { aiAuditPayloads, aiRuns, db } from "@/db";
import { encryptAiCredential } from "@/lib/ai/security/credentials";
import type { EncryptedAiAuditEvidence } from "@/lib/ai/audit/store";
import type { ClaimedReviewRun } from "@/lib/ai/runs/service";
import type { AiRunProgressStage } from "@/lib/ai/runs/stream-events";
import type { ReviewWorkspaceState } from "@/domain/resume/ai/review/workspace";
import type { ReviewUsage } from "./budget";

export async function persistReviewCheckpoint(input: {
  prepared: ClaimedReviewRun; sequence: number; progress: AiRunProgressStage[];
  state: ReviewWorkspaceState; usage?: ReviewUsage; usageComplete: boolean;
  budget: { attempts: number; inputUnits: number; outputUnits: number };
  round: number; retries: number; corrections: number; providerRequestId?: string;
  audit: EncryptedAiAuditEvidence;
}) {
  const { prepared, state, usage, usageComplete, budget, round, retries, corrections } = input;
  const encryptedExecutionPayload = encryptAiCredential(JSON.stringify({ version: 1, kind: "review_checkpoint", runId: prepared.runId, state, usage, usageComplete, budget, round, retries, corrections }), prepared.configuration.credentialsEncryptionKey);
  return db.transaction(async (transaction) => {
    const [owned] = await transaction.update(aiRuns).set({
      encryptedExecutionPayload, executionPayloadKeyVersion: 2, checkpointSequence: input.sequence,
      checkpointProgress: input.progress, inputTokens: usage?.inputTokens, cachedInputTokens: usage?.cachedInputTokens,
      outputTokens: usage?.outputTokens, providerRequestId: input.providerRequestId, updatedAt: new Date(),
    }).where(and(eq(aiRuns.id, prepared.runId), eq(aiRuns.userId, prepared.userId), eq(aiRuns.kind, "resume_review"), eq(aiRuns.status, "streaming"), eq(aiRuns.leaseOwner, prepared.leaseOwner), gt(aiRuns.leaseExpiresAt, new Date()), isNull(aiRuns.stopRequestedAt))).returning({ id: aiRuns.id });
    if (!owned) return false;
    await transaction.update(aiAuditPayloads).set(input.audit).where(eq(aiAuditPayloads.runId, prepared.runId));
    return true;
  });
}
