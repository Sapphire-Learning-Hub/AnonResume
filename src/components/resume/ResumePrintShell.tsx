import { ResumeRenderer } from "./ResumeRenderer";

export function ResumePrintShell({
  eyebrow,
  title,
  backHref,
  backLabel,
  document,
}: {
  eyebrow: string;
  title: string;
  backHref?: string;
  backLabel?: string;
  document: Parameters<typeof ResumeRenderer>[0]["document"];
}) {
  return (
    <main
      data-resume-print-shell="true"
      style={{
        minHeight: "100vh",
        padding: "32px 24px 64px",
        background: "#eef2f7",
      }}
    >
      <section
        data-print-chrome="screen"
        style={{
          width: "min(960px, 100%)",
          margin: "0 auto 20px",
          display: "grid",
          gap: 10,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#475569",
          }}
        >
          {eyebrow}
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 34,
            lineHeight: 1.1,
            color: "#0f172a",
          }}
        >
          {title}
        </h1>
        {backHref && backLabel ? (
          <a
            href={backHref}
            style={{
              width: "fit-content",
              color: "#0f62fe",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {backLabel}
          </a>
        ) : null}
      </section>

      <section
        data-resume-print-content="true"
        style={{ width: "min(960px, 100%)", margin: "0 auto" }}
      >
        <ResumeRenderer document={document} mode="print" />
      </section>
    </main>
  );
}
