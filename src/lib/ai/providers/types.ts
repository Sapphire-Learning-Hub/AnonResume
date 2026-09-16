import type { AiProviderEvent } from "@/lib/ai/runs/stream-events";

export interface AiProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiProposalToolDefinition {
  name: "propose_resume_changes";
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiProviderRequest {
  endpoint: URL;
  apiKey: string;
  model: string;
  messages: AiProviderMessage[];
  maxOutputTokens: number;
  trustedEndpointHostnames?: readonly string[];
  proposalTool?: AiProposalToolDefinition;
}

export interface AiProviderAdapter {
  start(
    request: AiProviderRequest,
    signal: AbortSignal,
  ): AsyncIterable<AiProviderEvent>;
}

export type AiProviderErrorCode =
  | "authentication"
  | "rate_limited"
  | "context_limit"
  | "unavailable"
  | "timeout"
  | "aborted"
  | "invalid_response";

export class AiProviderError extends Error {
  constructor(public readonly code: AiProviderErrorCode) {
    super(`ai_provider_${code}`);
    this.name = "AiProviderError";
  }
}
