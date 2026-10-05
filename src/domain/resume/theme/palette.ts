import type { ResumeDocument } from "@/domain/resume/schema";

const MINIMUM_TEXT_CONTRAST = 4.5;
const PAGE_BACKGROUND = "#ffffff";

type Rgb = readonly [red: number, green: number, blue: number];

export interface ResumeThemePalette {
  pageBackground: string;
  textForeground: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  accentSurface: string;
  accentBorder: string;
}

function parseHexColor(color: string): Rgb {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);

  if (!match) {
    throw new Error(`Invalid resume theme color: ${color}`);
  }

  const value =
    match[1]!.length === 3
      ? [...match[1]!].map((character) => character.repeat(2)).join("")
      : match[1]!;

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function formatHexColor([red, green, blue]: Rgb) {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function normalizeHexColor(color: string) {
  return formatHexColor(parseHexColor(color));
}

function blendColors(foreground: string, background: string, opacity: number) {
  const foregroundRgb = parseHexColor(foreground);
  const backgroundRgb = parseHexColor(background);

  return formatHexColor([
    foregroundRgb[0] * opacity + backgroundRgb[0] * (1 - opacity),
    foregroundRgb[1] * opacity + backgroundRgb[1] * (1 - opacity),
    foregroundRgb[2] * opacity + backgroundRgb[2] * (1 - opacity),
  ]);
}

function relativeLuminance(color: string) {
  const [red, green, blue] = parseHexColor(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return red! * 0.2126 + green! * 0.7152 + blue! * 0.0722;
}

function getContrastRatio(foreground: string, background: string) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );

  return (lighter + 0.05) / (darker + 0.05);
}

function ensureReadableForeground(foreground: string, background: string) {
  if (getContrastRatio(foreground, background) >= MINIMUM_TEXT_CONTRAST) {
    return foreground;
  }

  const endpoint =
    getContrastRatio("#000000", background) >=
    getContrastRatio("#ffffff", background)
      ? "#000000"
      : "#ffffff";
  let low = 0;
  let high = 1;

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const amount = (low + high) / 2;
    const candidate = blendColors(endpoint, foreground, amount);

    if (getContrastRatio(candidate, background) >= MINIMUM_TEXT_CONTRAST) {
      high = amount;
    } else {
      low = amount;
    }
  }

  return blendColors(endpoint, foreground, high);
}

export function deriveResumeThemePalette(
  theme: ResumeDocument["settings"]["theme"],
): ResumeThemePalette {
  const accent = normalizeHexColor(theme.accent);
  const textForeground = normalizeHexColor(theme.textColor);
  const muted = normalizeHexColor(theme.mutedColor);
  const accentSurface = blendColors(accent, PAGE_BACKGROUND, 0.08);

  return {
    pageBackground: PAGE_BACKGROUND,
    textForeground,
    mutedForeground: ensureReadableForeground(muted, PAGE_BACKGROUND),
    accent,
    accentForeground: ensureReadableForeground(accent, accentSurface),
    accentSurface,
    accentBorder: blendColors(accent, PAGE_BACKGROUND, 0.18),
  };
}
