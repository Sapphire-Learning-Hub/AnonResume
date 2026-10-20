"use client";

import { CloseCircleOutlined, WarningOutlined } from "@ant-design/icons";

import type { ResumeMarkdownDiagnostic } from "@/domain/resume/markdown";

import { useMarkdownEditingWorkspaceStyles } from "./MarkdownEditingWorkspace.style";

export interface MarkdownWorkspaceLabels {
  diagnostics: string;
  emptyDiagnostics: string;
  error: string;
  line: string;
  preview: string;
  source: string;
  stalePreview: string;
  warning: string;
}

export function MarkdownDiagnostics({
  diagnostics,
  getMessage,
  labels,
  onSelect,
}: {
  diagnostics: ResumeMarkdownDiagnostic[];
  getMessage: (diagnostic: ResumeMarkdownDiagnostic) => string;
  labels: MarkdownWorkspaceLabels;
  onSelect: (diagnostic: ResumeMarkdownDiagnostic) => void;
}) {
  const { styles } = useMarkdownEditingWorkspaceStyles();

  return (
    <section aria-label={labels.diagnostics} className={styles.diagnostics}>
      <h3 className={styles.diagnosticsHeading}>{labels.diagnostics}</h3>
      {diagnostics.length ? (
        <ul className={styles.diagnosticsList}>
          {diagnostics.map((diagnostic, index) => {
            const message = getMessage(diagnostic);
            const line = labels.line.replace("{line}", String(diagnostic.line));
            const severity =
              diagnostic.severity === "error" ? labels.error : labels.warning;

            return (
              <li key={`${diagnostic.code}-${diagnostic.line}-${diagnostic.column}-${index}`}>
                <button
                  aria-label={`${line}，${severity}：${message}`}
                  className={styles.diagnosticButton}
                  data-severity={diagnostic.severity}
                  type="button"
                  onClick={() => onSelect(diagnostic)}
                >
                  <span className={styles.diagnosticIcon} aria-hidden="true">
                    {diagnostic.severity === "error" ? (
                      <CloseCircleOutlined />
                    ) : (
                      <WarningOutlined />
                    )}
                  </span>
                  <span className={styles.diagnosticLine}>{line}</span>
                  <span className={styles.diagnosticMessage}>{message}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.emptyDiagnostics}>{labels.emptyDiagnostics}</p>
      )}
    </section>
  );
}
