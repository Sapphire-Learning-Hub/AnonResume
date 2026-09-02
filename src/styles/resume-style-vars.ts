import type { CSSProperties } from "react";

import { resolveResumeFontFamily } from "@/domain/resume/font-presets";
import type { ResumeDocument } from "@/domain/resume/schema";

type ResumeStyleProperties = CSSProperties & Record<`--${string}`, string>;

export function getResumeStyleVariables(
  document: ResumeDocument,
): ResumeStyleProperties {
  const fontFamily = resolveResumeFontFamily(
    document.settings.typography.fontFamily,
  );

  return {
    fontFamily,
    "--resume-page-background": "#ffffff",
    "--resume-font-family": fontFamily,
    "--resume-text-color": document.settings.theme.textColor,
    "--resume-muted-color": document.settings.theme.mutedColor,
    "--resume-accent": document.settings.theme.accent,
    "--resume-base-font-size": `${document.settings.typography.baseFontSize}px`,
    "--resume-line-height": `${document.settings.typography.lineHeight}`,
    "--resume-page-padding": `${document.settings.page.margin.top}px ${document.settings.page.margin.right}px ${document.settings.page.margin.bottom}px ${document.settings.page.margin.left}px`,
    "--resume-section-gap": "20px",
    "--resume-block-gap": "10px",
  };
}
