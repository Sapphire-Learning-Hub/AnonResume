import type { CSSProperties } from "react";

import { resolveResumeFontFamily } from "@/domain/resume/font-presets";
import type { ResumeDocument } from "@/domain/resume/schema";
import { deriveResumeThemePalette } from "@/domain/resume/theme/palette";

type ResumeStyleProperties = CSSProperties & Record<`--${string}`, string>;

export function getResumeStyleVariables(
  settings: ResumeDocument["settings"],
): ResumeStyleProperties {
  const fontFamily = resolveResumeFontFamily(
    settings.typography.fontFamily,
  );
  const palette = deriveResumeThemePalette(settings.theme);

  return {
    fontFamily,
    "--resume-page-background": palette.pageBackground,
    "--resume-font-family": fontFamily,
    "--resume-text-color": palette.textForeground,
    "--resume-muted-color": palette.mutedForeground,
    "--resume-accent": palette.accent,
    "--resume-accent-foreground": palette.accentForeground,
    "--resume-accent-surface": palette.accentSurface,
    "--resume-accent-border": palette.accentBorder,
    "--resume-base-font-size": `${settings.typography.baseFontSize}px`,
    "--resume-line-height": `${settings.typography.lineHeight}`,
    "--resume-page-padding": `${settings.page.margin.top}px ${settings.page.margin.right}px ${settings.page.margin.bottom}px ${settings.page.margin.left}px`,
    "--resume-section-gap": "20px",
    "--resume-block-gap": "10px",
  };
}
