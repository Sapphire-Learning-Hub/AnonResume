import type { CSSProperties } from "react";

import { resolveResumeFontFamily } from "@/domain/resume/font-presets";
import type { ResumeDocument } from "@/domain/resume/schema";

type ResumeStyleProperties = CSSProperties & Record<`--${string}`, string>;

export function getResumeStyleVariables(
  settings: ResumeDocument["settings"],
): ResumeStyleProperties {
  const fontFamily = resolveResumeFontFamily(
    settings.typography.fontFamily,
  );

  return {
    fontFamily,
    "--resume-page-background": "#ffffff",
    "--resume-font-family": fontFamily,
    "--resume-text-color": settings.theme.textColor,
    "--resume-muted-color": settings.theme.mutedColor,
    "--resume-accent": settings.theme.accent,
    "--resume-base-font-size": `${settings.typography.baseFontSize}px`,
    "--resume-line-height": `${settings.typography.lineHeight}`,
    "--resume-page-padding": `${settings.page.margin.top}px ${settings.page.margin.right}px ${settings.page.margin.bottom}px ${settings.page.margin.left}px`,
    "--resume-section-gap": "20px",
    "--resume-block-gap": "10px",
  };
}
