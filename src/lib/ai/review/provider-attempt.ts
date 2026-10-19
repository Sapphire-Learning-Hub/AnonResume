import { AiProviderError, type AiProviderAdapter, type AiProviderRequest } from "@/lib/ai/providers/types";
import { reviewActionSchema } from "@/domain/resume/ai/review/actions";
import { REVIEW_EXECUTION_POLICY } from "./policy";
import type { ReviewUsage } from "./budget";

export async function collectReviewResponse(input: {
  adapter: AiProviderAdapter; request: AiProviderRequest; signal: AbortSignal;
  onUsage: (usage: ReviewUsage) => void; onRequestId: (id: string) => void;
}) {
  let raw = "";
  const calls: Array<{ callId: string; name: string; arguments: string }> = [];
  let completed = false;
  let finishReason: string | null = null;
  for await (const event of input.adapter.start(input.request, input.signal)) {
    input.signal.throwIfAborted();
    if (event.type === "request_id") input.onRequestId(event.requestId);
    if (event.type === "text_delta") raw += event.delta;
    if (event.type === "usage") input.onUsage(event);
    if (event.type === "tool_call") calls.push(event);
    if (event.type === "complete") { completed = true; finishReason = event.finishReason; }
    if (raw.length + calls.reduce((sum, call) => sum + call.arguments.length, 0) > REVIEW_EXECUTION_POLICY.maxResponseCharacters || calls.length > 1) break;
  }
  input.signal.throwIfAborted();
  const call = calls[0];
  let candidate: unknown;
  try {
    candidate = input.request.tools
      ? call && { action: call.name, arguments: JSON.parse(call.arguments) as unknown }
      : JSON.parse(raw) as unknown;
  } catch { candidate = undefined; }
  const parsed = reviewActionSchema.safeParse(candidate);
  const validProtocol = completed && finishReason !== "length" && finishReason !== "content_filter"
    && (input.request.tools ? calls.length === 1 && finishReason === "tool_calls" : calls.length === 0 && finishReason === "stop")
    && raw.length + calls.reduce((sum, entry) => sum + entry.arguments.length, 0) <= REVIEW_EXECUTION_POLICY.maxResponseCharacters;
  return { action: validProtocol && parsed.success ? parsed.data : undefined, callId: call?.callId ?? "json-action", raw: call?.arguments ?? raw };
}

export function isReviewTimeout(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError && error.code === "timeout";
}
