import { describe, expect, it } from "vitest";

import {
  EDITOR_BASICS_FLOW_KEY,
  EDITOR_BASICS_FLOW_VERSION,
  editorOnboardingSteps,
} from "@/domain/onboarding/editor-basics";

describe("editor basics onboarding flow", () => {
  it("defines the versioned editor practice sequence", () => {
    expect(EDITOR_BASICS_FLOW_KEY).toBe("editor-basics");
    expect(EDITOR_BASICS_FLOW_VERSION).toBe(1);
    expect(editorOnboardingSteps.map(({ id }) => id)).toEqual([
      "canvas-intro",
      "edit-text",
      "format-text",
      "insert-content",
      "change-design",
      "reorder-content",
      "preview",
      "output-overview",
    ]);
    expect(editorOnboardingSteps.every(({ anchorId }) => anchorId.length > 0)).toBe(
      true,
    );
  });
});
