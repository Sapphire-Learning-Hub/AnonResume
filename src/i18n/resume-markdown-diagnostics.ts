import type { ResumeMarkdownDiagnostic } from "@/domain/resume/markdown/types";
import type { MessageKey } from "./messages";

const DIAGNOSTIC_MESSAGE_KEYS: Record<string, MessageKey> = {
  source_too_large: "editor.markdown.diagnostic.sourceTooLarge",
  frontmatter_required: "editor.markdown.diagnostic.frontmatterRequired",
  frontmatter_unclosed: "editor.markdown.diagnostic.frontmatterInvalid",
  frontmatter_invalid_entry: "editor.markdown.diagnostic.frontmatterInvalid",
  frontmatter_unknown_key: "editor.markdown.diagnostic.unknownSetting",
  frontmatter_duplicate_key: "editor.markdown.diagnostic.duplicateSetting",
  frontmatter_invalid_scalar: "editor.markdown.diagnostic.invalidSetting",
  frontmatter_unsupported_version:
    "editor.markdown.diagnostic.unsupportedVersion",
  frontmatter_invalid_page_margin: "editor.markdown.diagnostic.invalidSetting",
  frontmatter_invalid_number: "editor.markdown.diagnostic.invalidSetting",
  frontmatter_invalid_color: "editor.markdown.diagnostic.invalidColor",
  frontmatter_version_required:
    "editor.markdown.diagnostic.frontmatterRequired",
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
  unsupported_markdown: "editor.markdown.diagnostic.unsupportedMarkdown",
  image_asset_required: "editor.markdown.diagnostic.imageAssetRequired",
  document_validation_failed: "editor.markdown.diagnostic.documentInvalid",
  projection_degraded: "editor.markdown.diagnostic.projectionDegraded",
  projection_invalid: "editor.markdown.diagnostic.projectionInvalid",
  projection_conflict: "editor.markdown.diagnostic.projectionConflict",
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
