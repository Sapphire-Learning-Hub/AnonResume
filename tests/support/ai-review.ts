import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { aiModels, aiProviderCredentials, aiQuotaAccounts, aiUsageLedger, db, resumes } from "@/db";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { reviewDimensions } from "@/domain/resume/ai/review/schema";
import { encryptAiCredential } from "@/lib/ai/security/credentials";
import type { ReviewAction } from "@/domain/resume/ai/review/actions";
import type { AiProviderAdapter } from "@/lib/ai/providers/types";

export function reviewActions(): ReviewAction[] {
  return [
    { action: "read_review_content", arguments: {} },
    ...reviewDimensions.map((dimension) => ({ action: "submit_review_dimension" as const, arguments: { dimension, grade: 3, reason: "Some details can be clearer" } })),
    { action: "finish_review", arguments: { summary: "Clear resume", strengths: ["Clear structure"], matchSummary: null } },
  ];
}

export function reviewAdapter(options: { json?: boolean; usage?: boolean; actions?: ReviewAction[] } = {}): AiProviderAdapter {
  const actions = options.actions ?? reviewActions();
  let index = 0;
  return { async *start() {
    const action = actions[Math.min(index++, actions.length - 1)]!;
    if (options.json) yield { type: "text_delta", delta: JSON.stringify(action) };
    else yield { type: "tool_call", callId: `call-${index}`, name: action.action, arguments: JSON.stringify(action.arguments) };
    if (options.usage !== false) yield { type: "usage", inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200 };
    yield { type: "complete", finishReason: options.json ? "stop" : "tool_calls" };
  } };
}

export function reviewOutput() {
  return { summary: "Clear resume", dimensions: reviewDimensions.map((dimension) => ({ dimension, grade: 3, reason: "Some details can be clearer" })), strengths: ["Clear structure"], issues: [], match: null };
}

export async function createReviewFixture() {
  const encryptionKey = Buffer.alloc(32, 26);
  const userId = randomUUID();
  const resumeId = randomUUID();
  const [provider] = await db.insert(aiProviderCredentials).values({ kind: "platform", displayName: "Review fixture", baseUrl: "https://models.example.com/v1", encryptedApiKey: encryptAiCredential("sk-fixture", encryptionKey) }).returning();
  const [model] = await db.insert(aiModels).values({ providerId: provider!.id, providerModelKey: "review", displayName: "Review fixture", supportsToolCalls: true, contextWindow: 64000, maxOutputTokens: 4096, inputPointRate: 1000, cachedInputPointRate: 0, outputPointRate: 1000 }).returning();
  const document = createDefaultResumeDocument("en-US");
  await db.insert(resumes).values({ id: resumeId, userId, name: "Review", summary: "", document });
  return {
    userId, resumeId, modelId: model!.id, document,
    input: { modelId: model!.id, resumeVersion: 1, locale: "en-US" as const },
    configuration: { credentialsEncryptionKey: encryptionKey, auditRetentionDays: 30, defaultMonthlyPoints: 100000, requestsPerMinute: 100, streamCheckpointMs: 10, runLeaseSeconds: 90 },
    async cleanup() {
      await db.delete(aiUsageLedger).where(eq(aiUsageLedger.userId, userId));
      await db.delete(aiQuotaAccounts).where(eq(aiQuotaAccounts.userId, userId));
      await db.delete(resumes).where(eq(resumes.id, resumeId));
      await db.delete(aiProviderCredentials).where(eq(aiProviderCredentials.id, provider!.id));
    },
  };
}
