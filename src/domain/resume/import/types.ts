import type { AppLocale } from "@/i18n/messages";

import type { ResumeDocument } from "../schema";

export type ResumeMarkdownDialect = "auto" | "mujicv" | "standard";
export type DetectedResumeMarkdownDialect = Exclude<
  ResumeMarkdownDialect,
  "auto"
>;

export interface ResumeImportDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
  line: number;
  column?: number;
}

export interface ResumeImportReport {
  requestedDialect: ResumeMarkdownDialect;
  detectedDialect: DetectedResumeMarkdownDialect;
  sectionCount: number;
  diagnostics: ResumeImportDiagnostic[];
}

export interface ResumeImportMetadata {
  format: "markdown";
  dialect: DetectedResumeMarkdownDialect;
  importedAt: string;
  originalSource: string;
  diagnostics: ResumeImportDiagnostic[];
}

export interface ResumeMarkdownImportResult {
  document: ResumeDocument;
  report: ResumeImportReport;
}

export interface ResumeMarkdownImportInput {
  markdown: string;
  dialect: ResumeMarkdownDialect;
  locale: AppLocale;
}

export const resumeMarkdownDialects: ResumeMarkdownDialect[] = [
  "auto",
  "mujicv",
  "standard",
];

export function isResumeMarkdownDialect(
  value: unknown,
): value is ResumeMarkdownDialect {
  return (
    typeof value === "string" &&
    resumeMarkdownDialects.includes(value as ResumeMarkdownDialect)
  );
}
