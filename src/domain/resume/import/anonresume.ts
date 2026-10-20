import { formatMessage, getMessages } from "@/i18n/messages";
import { getResumeMarkdownDiagnosticMessage } from "@/i18n/resume-markdown-diagnostics";

import { createDefaultResumeDocument } from "../default-document";
import { parseResumeMarkdown } from "../markdown/parse";
import { validateResumeDocument } from "../validation";
import type {
  ResumeImportDiagnostic,
  ResumeMarkdownImportInput,
  ResumeMarkdownImportResult,
} from "./types";

export function hasAnonResumeMarkdownHeader(source: string) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return false;
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") return false;
    if (/^\s*anonresume\s*:/.test(line)) return true;
  }
  return false;
}

export function importAnonResumeMarkdown(
  input: ResumeMarkdownImportInput,
): ResumeMarkdownImportResult {
  const parsed = parseResumeMarkdown({
    source: input.markdown.replace(/^\uFEFF/, ""),
    baseDocument: {
      ...createDefaultResumeDocument(input.locale),
      sections: [],
    },
    locale: input.locale,
  });
  const messages = getMessages(input.locale);
  const diagnostics: ResumeImportDiagnostic[] = parsed.diagnostics.map(
    (diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      line: diagnostic.line,
      column: diagnostic.column,
      message: getResumeMarkdownDiagnosticMessage(
        (key, values) => formatMessage(messages, key, values),
        diagnostic,
      ),
    }),
  );
  if (
    !parsed.document &&
    !diagnostics.some((diagnostic) => diagnostic.severity === "error")
  )
    diagnostics.push({
      severity: "error",
      code: "document_validation_failed",
      line: 1,
      message: messages["editor.markdown.diagnostic.documentInvalid"],
    });
  const document =
    parsed.document && !parsed.hasErrors
      ? validateResumeDocument({
          ...parsed.document,
          meta: {
            ...parsed.document.meta,
            import: {
              format: "markdown",
              dialect: "anonresume",
              originalSource: input.markdown,
              importedAt: new Date().toISOString(),
              diagnostics,
            },
          },
        })
      : createDefaultResumeDocument(input.locale);
  return {
    document,
    report: {
      requestedDialect: input.dialect,
      detectedDialect: "anonresume",
      sectionCount: document.sections.length,
      diagnostics,
    },
  };
}
