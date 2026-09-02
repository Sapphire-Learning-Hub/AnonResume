import { ResumeRenderer } from "./ResumeRenderer";
import { ResponsiveResumeViewport } from "./ResponsiveResumeViewport";
import { PublicPdfExportButton } from "../pdf/PublicPdfExportButton";

export function ResumeViewShell({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  downloadHref,
  downloadLabel,
  document,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  downloadHref?: string;
  downloadLabel?: string;
  document: Parameters<typeof ResumeRenderer>[0]["document"];
}) {
  return (
    <main className="resume-view-shell">
      <section className="resume-view-header">
        <p className="resume-view-eyebrow">
          {eyebrow}
        </p>
        <h1 className="resume-view-title">{title}</h1>
        <p className="resume-view-description">
          {description}
        </p>
        {backHref && backLabel ? (
          <a className="resume-view-action" href={backHref}>
            {backLabel}
          </a>
        ) : null}
        {downloadHref && downloadLabel ? (
          <PublicPdfExportButton
            label={downloadLabel}
            slug={downloadHref.split("/").at(-2) || ""}
          />
        ) : null}
      </section>

      <section className="resume-view-content">
        <ResponsiveResumeViewport reflowAt={640}>
          <ResumeRenderer document={document} mode="view" responsiveView />
        </ResponsiveResumeViewport>
      </section>
    </main>
  );
}
