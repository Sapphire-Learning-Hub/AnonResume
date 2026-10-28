import type { ResumeDocument } from "../schema";

export const RESUME_MARKDOWN_SOURCE_VERSION = 2 as const;
export const RESUME_MARKDOWN_PROJECTION_VERSION = 1 as const;

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
  kind?: ResumeMarkdownProjectionNodeKind;
  path?: number[];
  parentId?: string;
  ordinal?: number;
  fingerprint?: string;
  inlineSpan?: ResumeMarkdownInlineSpan;
  explicitAttributes?: string[];
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
  projection?: ResumeMarkdownProjection;
  hasErrors: boolean;
}

export interface ResumeMarkdownSerializeResult {
  source: string;
  diagnostics: ResumeMarkdownDiagnostic[];
  sourceMap: ResumeMarkdownSourceMap;
  projection: ResumeMarkdownProjection;
}

export type ResumeMarkdownProjectionNodeKind =
  | "section"
  | "text"
  | "image"
  | "list"
  | "list-item"
  | "badges"
  | "badge"
  | "group"
  | "row"
  | "inline-span";

export type ResumeMarkdownProjectedMark = "tag" | "underline" | "textColor";

export interface ResumeMarkdownInlineSpan {
  richTextPath: [paragraphIndex: number, nodeIndex: number];
  start: number;
  end: number;
  contextFingerprint: string;
  mark: ResumeMarkdownProjectedMark;
  color?: string;
}

export interface ResumeMarkdownProjectionEntry extends ResumeMarkdownSourceRange {
  id: string;
  kind: ResumeMarkdownProjectionNodeKind;
  path: number[];
  parentId?: string;
  ordinal: number;
  fingerprint: string;
  inlineSpan?: ResumeMarkdownInlineSpan;
}

export interface ResumeMarkdownProjection {
  version: typeof RESUME_MARKDOWN_PROJECTION_VERSION;
  baseDocumentVersion: number;
  sections: ResumeMarkdownProjectionEntry[];
  nodes: ResumeMarkdownProjectionEntry[];
}

export interface ResumeMarkdownProjectionApplyResult {
  document: ResumeDocument;
  projection: ResumeMarkdownProjection;
  diagnostics: ResumeMarkdownDiagnostic[];
}

export interface ResumeMarkdownFrontMatter {
  version: 1 | typeof RESUME_MARKDOWN_SOURCE_VERSION;
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
