export type AiProviderEvent =
  | { type: "request_id"; requestId: string }
  | { type: "reasoning_progress" }
  | { type: "text_delta"; delta: string }
  | { type: "proposal_delta"; delta: string }
  | {
      type: "usage";
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
    }
  | { type: "complete"; finishReason: string | null };

export type AiClientStreamEvent =
  | { sequence: number; type: "snapshot"; text: string; proposalText: string }
  | ({ sequence: number } & AiProviderEvent)
  | { sequence: number; type: "error"; code: string };

export function encodeAiStreamEvent(event: AiClientStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}
