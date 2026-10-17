import type { AppLocale } from "@/i18n/messages";

import type { ResumeDocument } from "../schema";
import { parseResumeMarkdown } from "./parse";
import { serializeResumeMarkdown } from "./serialize";
import type { ResumeMarkdownProjection } from "./types";

function fenceMarker(line: string) {
  return /^ {0,3}((?:`{3,})|(?:~{3,}))/.exec(line)?.[1];
}

export function normalizeResumeMarkdownSource(source: string) {
  const lines = source
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n");
  const output: string[] = [];
  let frontMatter = lines[0] === "---";
  let activeFence: { character: string; length: number } | undefined;
  let activeComment = false;
  let pendingBlank = false;

  const flushBlank = () => {
    if (pendingBlank && output.length > 0 && output.at(-1) !== "") {
      output.push("");
    }
    pendingBlank = false;
  };

  for (const [index, line] of lines.entries()) {
    if (frontMatter) {
      output.push(line);
      if (index > 0 && line === "---") frontMatter = false;
      continue;
    }

    if (activeFence) {
      output.push(line);
      const closing = fenceMarker(line);
      if (
        closing &&
        closing[0] === activeFence.character &&
        closing.length >= activeFence.length
      ) {
        activeFence = undefined;
      }
      continue;
    }

    if (activeComment) {
      output.push(line);
      if (line.includes("-->")) activeComment = false;
      continue;
    }

    const opening = fenceMarker(line);
    if (opening) {
      flushBlank();
      output.push(line);
      activeFence = { character: opening[0]!, length: opening.length };
      continue;
    }

    const commentStart = line.indexOf("<!--");
    if (
      commentStart >= 0 &&
      !line.slice(commentStart + 4).includes("-->")
    ) {
      flushBlank();
      output.push(line);
      activeComment = true;
      continue;
    }

    if (line.trim() === "") {
      pendingBlank = true;
      continue;
    }
    flushBlank();
    output.push(line);
  }

  while (output.at(-1) === "") output.pop();
  return `${output.join("\n")}\n`;
}

function documentsEqual(left: ResumeDocument, right: ResumeDocument) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function formatResumeMarkdown(
  source: string,
  baseDocument: ResumeDocument,
  locale: AppLocale,
  options: {
    baseDocumentVersion?: number;
    projection?: ResumeMarkdownProjection;
  } = {},
) {
  const normalizedSource = normalizeResumeMarkdownSource(source);
  const baseDocumentVersion = options.baseDocumentVersion ?? 0;
  const baseSerialization = serializeResumeMarkdown(baseDocument, {
    baseDocumentVersion,
  });
  const activeProjection = options.projection ?? baseSerialization.projection;
  const parsed = parseResumeMarkdown({
    source: normalizedSource,
    baseDocument,
    baseDocumentVersion,
    locale,
    projection: activeProjection,
  });
  const projection = parsed.projection ?? activeProjection;

  if (parsed.hasErrors || !parsed.document) {
    return {
      source: normalizedSource,
      result: parsed,
      projection,
      changed: normalizedSource !== source,
      semanticChanged: false,
    };
  }

  return {
    source: normalizedSource,
    result: parsed,
    projection,
    changed: normalizedSource !== source,
    semanticChanged: !documentsEqual(baseDocument, parsed.document),
  };
}
