"use client";

import { CloseCircleOutlined, WarningOutlined } from "@ant-design/icons";

import type { ResumeMarkdownDiagnostic } from "@/domain/resume/markdown";
import type { MessageKey } from "@/i18n/messages";

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

const DIAGNOSTIC_MESSAGE_KEYS: Record<string, MessageKey> = {
  source_too_large: "editor.markdown.diagnostic.sourceTooLarge",
  frontmatter_required: "editor.markdown.diagnostic.frontmatterRequired",
  frontmatter_unclosed: "editor.markdown.diagnostic.frontmatterInvalid",
  frontmatter_invalid_entry: "editor.markdown.diagnostic.frontmatterInvalid",
  frontmatter_unknown_key: "editor.markdown.diagnostic.unknownSetting",
  frontmatter_duplicate_key: "editor.markdown.diagnostic.duplicateSetting",
  frontmatter_invalid_scalar: "editor.markdown.diagnostic.invalidSetting",
  frontmatter_unsupported_version: "editor.markdown.diagnostic.unsupportedVersion",
  frontmatter_invalid_page_margin: "editor.markdown.diagnostic.invalidSetting",
  frontmatter_invalid_number: "editor.markdown.diagnostic.invalidSetting",
  frontmatter_invalid_color: "editor.markdown.diagnostic.invalidColor",
  frontmatter_version_required: "editor.markdown.diagnostic.frontmatterRequired",
  block_duplicate_attribute: "editor.markdown.diagnostic.duplicateSetting",
  block_invalid_attribute: "editor.markdown.diagnostic.invalidSetting",
  block_unknown_directive: "editor.markdown.diagnostic.unknownDirective",
  block_nesting_too_deep: "editor.markdown.diagnostic.invalidNesting",
  block_unclosed_directive: "editor.markdown.diagnostic.unclosedDirective",
  block_invalid_nesting: "editor.markdown.diagnostic.invalidNesting",
  inline_unknown_directive: "editor.markdown.diagnostic.unknownInline",
  inline_unclosed_directive: "editor.markdown.diagnostic.unclosedInline",
  inline_invalid_color: "editor.markdown.diagnostic.invalidColor",
  inline_invalid_icon: "editor.markdown.diagnostic.invalidIcon",
  raw_html_not_allowed: "editor.markdown.diagnostic.rawHtml",
  document_validation_failed: "editor.markdown.diagnostic.documentInvalid",
};

export function getResumeMarkdownDiagnosticMessage(
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
  diagnostic: ResumeMarkdownDiagnostic,
) {
  return t(
    DIAGNOSTIC_MESSAGE_KEYS[diagnostic.code] ??
      "editor.markdown.diagnostic.generic",
    diagnostic.parameters,
  );
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
