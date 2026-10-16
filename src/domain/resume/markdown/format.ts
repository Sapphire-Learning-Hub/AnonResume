import type { AppLocale } from "@/i18n/messages";

import type { ResumeDocument } from "../schema";
import { parseResumeMarkdown } from "./parse";
import { reconcileResumeMarkdown } from "./reconcile";
import { serializeResumeMarkdown } from "./serialize";

function removeMarkdownComments(source: string) {
  return source.replace(/<!--[^]*?-->/g, "");
}

export function formatResumeMarkdown(
  source: string,
  baseDocument: ResumeDocument,
  locale: AppLocale,
) {
  const normalizedInput = removeMarkdownComments(source).replaceAll("\r\n", "\n");
  const parsed = parseResumeMarkdown({
    source: normalizedInput,
    baseDocument,
    locale,
  });
  if (parsed.hasErrors || !parsed.document) {
    return {
      source,
      result: parsed,
      changed: false,
      semanticChanged: false,
    };
  }

  const document = reconcileResumeMarkdown(
    baseDocument,
    parsed.document,
    parsed.sourceMap,
  );
  const serialized = serializeResumeMarkdown(document);
  const canonicalBase = serializeResumeMarkdown(baseDocument).source;
  return {
    source: serialized.source,
    result: { ...parsed, document },
    changed: serialized.source !== source,
    semanticChanged: serialized.source !== canonicalBase,
  };
}
