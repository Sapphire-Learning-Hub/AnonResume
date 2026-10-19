import { AiProviderError, type AiProviderRequest } from "@/lib/ai/providers/types";
import { DEFAULT_AI_PROVIDER_TIMEOUT_POLICY } from "@/lib/ai/providers/timeout-policy";
import { REVIEW_EXECUTION_POLICY as policy, ReviewExecutionError } from "./policy";

export type ReviewUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };
export function estimateReviewInput(request: Pick<AiProviderRequest, "messages" | "tools">) {
  return new TextEncoder().encode(JSON.stringify({ messages: request.messages, tools: request.tools })).byteLength + 512 + request.messages.length * 32;
}
export function createReviewBudget() {
  let attempts = 0;
  let inputUnits = 0;
  let outputUnits = 0;
  let pending: { input: number; output: number } | undefined;
  function prepare(request: AiProviderRequest, contextWindow: number, remainingMs: number): AiProviderRequest {
    if (remainingMs <= 0) throw new ReviewExecutionError("review_deadline");
    if (attempts >= policy.maxRequests) throw new ReviewExecutionError("review_round_limit");
    if (pending) throw new Error("review_usage_not_recorded");
    const output = Math.min(request.maxOutputTokens, policy.maxOutputPerRequest, policy.maxOutputTokens - outputUnits);
    const input = estimateReviewInput(request);
    if (output <= 0 || inputUnits + input > policy.maxInputUnits) throw new ReviewExecutionError("review_budget_exceeded");
    if (input + output > contextWindow) throw new AiProviderError("context_limit");
    const timeouts = request.timeoutPolicy ?? DEFAULT_AI_PROVIDER_TIMEOUT_POLICY;
    const totalTimeoutMs = Math.min(timeouts.totalTimeoutMs, policy.maxRequestMs, remainingMs);
    attempts += 1;
    inputUnits += input;
    outputUnits += output;
    pending = { input, output };
    return { ...request, maxOutputTokens: output, timeoutPolicy: {
      totalTimeoutMs, connectionTimeoutMs: Math.min(timeouts.connectionTimeoutMs, totalTimeoutMs),
      firstChunkTimeoutMs: Math.min(timeouts.firstChunkTimeoutMs, totalTimeoutMs),
      streamIdleTimeoutMs: Math.min(timeouts.streamIdleTimeoutMs, totalTimeoutMs),
    } };
  }
  function recordUsage(usage?: ReviewUsage) {
    if (!pending) return;
    if (usage) {
      inputUnits += Math.max(0, usage.inputTokens - pending.input);
      outputUnits += usage.outputTokens - pending.output;
    }
    pending = undefined;
  }
  return { prepare, recordUsage, snapshot: () => ({ attempts, inputUnits, outputUnits }) };
}
