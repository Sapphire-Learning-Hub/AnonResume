import type { ResumeDocument } from "./schema";

export const resumeVisualPresetIds = [
  "balanced",
  "compact",
  "classic",
] as const;

export type ResumeVisualPresetId = (typeof resumeVisualPresetIds)[number];

export interface ResumeVisualPreset {
  id: ResumeVisualPresetId;
  typography: ResumeDocument["settings"]["typography"];
  theme: ResumeDocument["settings"]["theme"];
  pageMargin: ResumeDocument["settings"]["page"]["margin"];
}

const resumeVisualPresets: readonly ResumeVisualPreset[] = [
  {
    id: "balanced",
    typography: {
      fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
      baseFontSize: 14,
      lineHeight: 1.45,
    },
    theme: {
      accent: "#0f62fe",
      textColor: "#0f172a",
      mutedColor: "#475569",
    },
    pageMargin: {
      top: 32,
      right: 32,
      bottom: 32,
      left: 32,
    },
  },
  {
    id: "compact",
    typography: {
      fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
      baseFontSize: 13,
      lineHeight: 1.35,
    },
    theme: {
      accent: "#0f62fe",
      textColor: "#111827",
      mutedColor: "#4b5563",
    },
    pageMargin: {
      top: 24,
      right: 28,
      bottom: 24,
      left: 28,
    },
  },
  {
    id: "classic",
    typography: {
      fontFamily: '"Source Serif 4", Georgia, serif',
      baseFontSize: 14,
      lineHeight: 1.5,
    },
    theme: {
      accent: "#0f4c5c",
      textColor: "#172033",
      mutedColor: "#52616b",
    },
    pageMargin: {
      top: 36,
      right: 36,
      bottom: 36,
      left: 36,
    },
  },
];

function clonePreset(preset: ResumeVisualPreset): ResumeVisualPreset {
  return {
    ...preset,
    typography: { ...preset.typography },
    theme: { ...preset.theme },
    pageMargin: { ...preset.pageMargin },
  };
}

function hasMatchingProperties(
  document: ResumeDocument,
  preset: ResumeVisualPreset,
) {
  const { typography, theme } = document.settings;
  const { margin } = document.settings.page;

  return (
    typography.fontFamily === preset.typography.fontFamily &&
    typography.baseFontSize === preset.typography.baseFontSize &&
    typography.lineHeight === preset.typography.lineHeight &&
    theme.accent === preset.theme.accent &&
    theme.textColor === preset.theme.textColor &&
    theme.mutedColor === preset.theme.mutedColor &&
    margin.top === preset.pageMargin.top &&
    margin.right === preset.pageMargin.right &&
    margin.bottom === preset.pageMargin.bottom &&
    margin.left === preset.pageMargin.left
  );
}

export function listResumeVisualPresets(): ResumeVisualPreset[] {
  return resumeVisualPresets.map(clonePreset);
}

export function getMatchingResumeVisualPresetId(
  document: ResumeDocument,
): ResumeVisualPresetId | undefined {
  return resumeVisualPresets.find((preset) =>
    hasMatchingProperties(document, preset),
  )?.id;
}

export function applyResumeVisualPreset(
  document: ResumeDocument,
  presetId: ResumeVisualPresetId,
): ResumeDocument {
  const preset = resumeVisualPresets.find((candidate) => candidate.id === presetId);

  if (!preset) {
    throw new Error(`Unknown resume visual preset: ${presetId}`);
  }

  return {
    ...document,
    settings: {
      ...document.settings,
      typography: { ...preset.typography },
      theme: { ...preset.theme },
      page: {
        ...document.settings.page,
        margin: { ...preset.pageMargin },
      },
    },
  };
}
