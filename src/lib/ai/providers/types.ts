import type { AiProviderEvent } from "@/lib/ai/runs/stream-events";

export type AiProviderMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string;
      toolCalls?: never;
      toolCallId?: never;
    }
  | {
      role: "assistant";
      content: string;
      toolCalls: Array<{
        id: string;
        name: string;
        arguments: string;
      }>;
      toolCallId?: never;
    }
  | {
      role: "tool";
      content: string;
      toolCallId: string;
      toolCalls?: never;
    };

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiProposalToolDefinition extends AiToolDefinition {
  name: "propose_resume_changes";
}

export interface AiProviderRequest {
  diagnosticRunId?: string;
  endpoint: URL;
  apiKey: string;
  model: string;
  messages: AiProviderMessage[];
  maxOutputTokens: number;
  latencyPreference?: "fast" | "provider_default";
  trustedEndpointHostnames?: readonly string[];
  proposalTool?: AiProposalToolDefinition;
  tools?: AiToolDefinition[];
  toolChoice?: "auto" | "required";
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
