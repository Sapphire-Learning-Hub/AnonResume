import { describe, expect, it } from "vitest";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  applyResumeVisualPreset,
  getMatchingResumeVisualPresetId,
  listResumeVisualPresets,
} from "@/domain/resume/style-presets";

describe("resume visual presets", () => {
  it("recognizes the default document as the balanced preset", () => {
    expect(getMatchingResumeVisualPresetId(createDefaultResumeDocument())).toBe(
      "balanced",
    );
  });

  it("applies every visual setting atomically without changing resume content", () => {
    const document = createDefaultResumeDocument();
    const compactDocument = applyResumeVisualPreset(document, "compact");

    expect(compactDocument).not.toBe(document);
    expect(compactDocument.sections).toBe(document.sections);
    expect(compactDocument.settings.typography).toEqual({
      fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
      baseFontSize: 13,
      lineHeight: 1.35,
    });
    expect(compactDocument.settings.theme).toEqual({
      accent: "#0f62fe",
      textColor: "#111827",
      mutedColor: "#4b5563",
    });
    expect(compactDocument.settings.page.margin).toEqual({
      top: 24,
      right: 28,
      bottom: 24,
      left: 28,
    });
    expect(document.settings.typography.baseFontSize).toBe(14);
    expect(getMatchingResumeVisualPresetId(compactDocument)).toBe("compact");
  });

  it("treats manual visual adjustments as a custom configuration", () => {
    const document = createDefaultResumeDocument();
    document.settings.theme.accent = "#2563eb";

    expect(getMatchingResumeVisualPresetId(document)).toBeUndefined();
  });

  it("returns copies of available presets so callers cannot alter definitions", () => {
    const [balancedPreset] = listResumeVisualPresets();

    if (!balancedPreset) {
      throw new Error("Expected the balanced preset to exist.");
    }

    balancedPreset.typography.baseFontSize = 99;

    expect(listResumeVisualPresets()[0]?.typography.baseFontSize).toBe(14);
  });
});
