import type { CSSProperties } from "react";

import { WorkspaceBackIcon } from "@/components/ui/InlineIcons";
import {
  resolvePublicResumeChromeTheme,
  type PublicResumeAppearance,
} from "@/domain/resume/public-appearance";

import { ResumeRenderer } from "./ResumeRenderer";
import { ResponsiveResumeViewport } from "./ResponsiveResumeViewport";
import { PublicPdfExportButton } from "../pdf/PublicPdfExportButton";

type PublicViewStyle = CSSProperties &
  Partial<Record<`--public-view-${string}`, string>>;

export function ResumeViewShell({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  downloadHref,
  downloadLabel,
  document,
  appearance,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  downloadHref?: string;
  downloadLabel?: string;
  document: Parameters<typeof ResumeRenderer>[0]["document"];
  appearance?: PublicResumeAppearance;
}) {
  const headerMode = appearance?.header ?? "full";
  const showHeader = headerMode !== "none";
  const showActions = !appearance || headerMode === "full";
  const shellStyle: PublicViewStyle | undefined = appearance
    ? ({
        "--public-view-background": appearance.background
          ? `#${appearance.background}`
          : undefined,
        "--public-view-accent": appearance.accent
          ? `#${appearance.accent}`
          : undefined,
        "--public-view-padding": `${appearance.padding}px`,
        "--public-view-padding-top": `${appearance.padding * 2}px`,
        "--public-view-padding-bottom": `${appearance.padding * 3}px`,
        "--public-view-width": `${appearance.width}px`,
        "--public-view-gap": `${appearance.gap}px`,
      } satisfies PublicViewStyle)
    : undefined;

  return (
    <main
      className="resume-view-shell"
      data-view-theme={
        appearance ? resolvePublicResumeChromeTheme(appearance) : undefined
      }
      data-view-surface={appearance?.surface}
      data-view-header={appearance?.header}
      data-view-labels={appearance?.labels}
      data-view-frame={appearance?.frame}
      data-view-align={appearance?.align}
      data-view-custom-background={appearance?.background ? "true" : undefined}
      style={shellStyle}
    >
      {showHeader ? (
        <section
          aria-labelledby="resume-view-title"
          className="resume-view-header"
        >
          <div className="resume-view-heading">
            {eyebrow ? <p className="resume-view-eyebrow">{eyebrow}</p> : null}
            <h1 className="resume-view-title" id="resume-view-title">
              {title}
            </h1>
            {description ? (
              <p className="resume-view-description">{description}</p>
            ) : null}
          </div>

          {showActions && backHref && backLabel ? (
            <div className="resume-view-actions">
              <a className="resume-view-action" href={backHref}>
                <WorkspaceBackIcon />
                <span>{backLabel}</span>
              </a>
            </div>
          ) : showActions && downloadHref && downloadLabel ? (
            <div className="resume-view-actions">
              <PublicPdfExportButton
                label={downloadLabel}
                slug={downloadHref.split("/").at(-2) || ""}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="resume-view-content">
        <ResponsiveResumeViewport reflowAt={640}>
          <ResumeRenderer document={document} mode="view" responsiveView />
        </ResponsiveResumeViewport>
      </section>
    </main>
  );
}
