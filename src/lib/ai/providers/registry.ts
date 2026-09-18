import { createOpenAiCompatibleAdapter } from "./openai-compatible";
import type { AiProviderAdapter } from "./types";

export type AiProviderProtocol = "openai-compatible";

export function createAiProviderAdapter(
  protocol: AiProviderProtocol,
): AiProviderAdapter {
  switch (protocol) {
    case "openai-compatible":
      return createOpenAiCompatibleAdapter();
  }
}
