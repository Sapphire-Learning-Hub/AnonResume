export const aiRunProgressStages = [
  "analyzing_resume",
  "thinking",
  "drafting_response",
  "generating_changes",
  "validating_result",
  "repairing_changes",
  "revalidating_result",
  "saving_result",
] as const;

export type AiRunProgressStage = (typeof aiRunProgressStages)[number];

export type AiProviderEvent =
  | { type: "request_id"; requestId: string }
  | { type: "reasoning_progress" }
  | { type: "text_delta"; delta: string }
  | { type: "proposal_delta"; delta: string }
  | {
      type: "tool_call";
      callId: string;
      name: string;
      arguments: string;
    }
  | {
      type: "usage";
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
    }
  | { type: "complete"; finishReason: string | null };

export type AiClientStreamEvent =
  | { sequence: number; type: "snapshot"; text: string; proposalText: string }
  | { sequence: number; type: "progress"; stage: AiRunProgressStage }
  | { sequence: number; type: "proposal_reset" }
  | ({ sequence: number } & Exclude<AiProviderEvent, { type: "tool_call" }>)
  | { sequence: number; type: "error"; code: string };

export function encodeAiStreamEvent(event: AiClientStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}
