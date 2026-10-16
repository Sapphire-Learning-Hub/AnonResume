import type { ResumeDocument } from "../schema";

export type ResumeMarkdownDiagnosticSeverity = "warning" | "error";

export interface ResumeMarkdownDiagnostic {
  severity: ResumeMarkdownDiagnosticSeverity;
  code: string;
  parameters: Record<string, string | number>;
  line: number;
  column: number;
}

export interface ResumeMarkdownSourceRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface ResumeMarkdownSourceMapEntry extends ResumeMarkdownSourceRange {
  id: string;
}

export interface ResumeMarkdownSourceMap {
  document: ResumeMarkdownSourceRange;
  sections: ResumeMarkdownSourceMapEntry[];
  blocks: ResumeMarkdownSourceMapEntry[];
}

export interface ResumeMarkdownParseResult {
  document?: ResumeDocument;
  diagnostics: ResumeMarkdownDiagnostic[];
  sourceMap: ResumeMarkdownSourceMap;
  hasErrors: boolean;
}

export interface ResumeMarkdownSerializeResult {
  source: string;
  diagnostics: ResumeMarkdownDiagnostic[];
  sourceMap: ResumeMarkdownSourceMap;
}

export interface ResumeMarkdownFrontMatter {
  version: 1;
  title?: string;
  locale?: string;
  pageMargin?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  accent?: string;
  textColor?: string;
  mutedColor?: string;
}

export interface ResumeMarkdownFrontMatterResult {
  frontMatter?: ResumeMarkdownFrontMatter;
  body: string;
  bodyStartLine: number;
  diagnostics: ResumeMarkdownDiagnostic[];
}
