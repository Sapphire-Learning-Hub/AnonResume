import type { ResumeMarkdownDiagnostic } from "./types";

export interface ResumeMarkdownTextSyntaxNode {
  kind: "markdown";
  source: string;
  line: number;
}

export interface ResumeMarkdownDirectiveSyntaxNode {
  kind: "directive";
  name: "text" | "list" | "item" | "badges" | "group" | "row" | "left" | "right";
  attributes: Record<string, string>;
  children: ResumeMarkdownSyntaxNode[];
  line: number;
}

export type ResumeMarkdownSyntaxNode =
  | ResumeMarkdownTextSyntaxNode
  | ResumeMarkdownDirectiveSyntaxNode;

const KNOWN_DIRECTIVES = new Set([
  "text",
  "list",
  "item",
  "badges",
  "group",
  "row",
  "left",
  "right",
]);

function diagnostic(
  code: string,
  line: number,
  parameters: Record<string, string | number> = {},
): ResumeMarkdownDiagnostic {
  return { severity: "error", code, parameters, line, column: 1 };
}

export function parseDirectiveAttributes(
  source: string,
  line: number,
  diagnostics: ResumeMarkdownDiagnostic[],
) {
  const attributes: Record<string, string> = {};
  const pattern = /([a-z][a-z-]*)=(?:"([^"]*)"|([^\s]+))/g;
  let consumed = "";
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    consumed += `${consumed ? " " : ""}${match[0]}`;
    const key = match[1]!;
    if (key in attributes) {
      diagnostics.push(diagnostic("block_duplicate_attribute", line, { key }));
    }
    attributes[key] = match[2] ?? match[3] ?? "";
  }
  if (consumed !== source.trim()) {
    diagnostics.push(diagnostic("block_invalid_attribute", line));
  }
  return attributes;
}

export function parseResumeMarkdownDirectives(source: string, startLine: number) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const diagnostics: ResumeMarkdownDiagnostic[] = [];

  function parseSequence(index: number, depth: number): {
    nodes: ResumeMarkdownSyntaxNode[];
    nextIndex: number;
    closed: boolean;
  } {
    const nodes: ResumeMarkdownSyntaxNode[] = [];
    let markdownStart = index;

    const flushMarkdown = (end: number) => {
      const chunk = lines.slice(markdownStart, end).join("\n");
      if (chunk.trim()) {
        nodes.push({
          kind: "markdown",
          source: chunk.replace(/^\n+|\n+$/g, ""),
          line: startLine + markdownStart,
        });
      }
    };

    while (index < lines.length) {
      const line = lines[index]!;
      if (/^\s*:::\s*$/.test(line)) {
        flushMarkdown(index);
        return { nodes, nextIndex: index + 1, closed: true };
      }

      const opening = /^\s*:::([a-z][a-z0-9-]*)(?:\s+\{(.*)\})?\s*$/.exec(line);
      if (!opening) {
        index += 1;
        continue;
      }

      flushMarkdown(index);
      const name = opening[1]!.toLowerCase();
      const lineNumber = startLine + index;
      if (!KNOWN_DIRECTIVES.has(name)) {
        diagnostics.push(diagnostic("block_unknown_directive", lineNumber, { name }));
      }
      if (depth >= 8) {
        diagnostics.push(diagnostic("block_nesting_too_deep", lineNumber));
      }
      const attributes = parseDirectiveAttributes(
        opening[2] ?? "",
        lineNumber,
        diagnostics,
      );
      const nested = parseSequence(index + 1, depth + 1);
      if (!nested.closed) {
        diagnostics.push(
          diagnostic("block_unclosed_directive", lineNumber, { name }),
        );
      }
      if (KNOWN_DIRECTIVES.has(name)) {
        nodes.push({
          kind: "directive",
          name: name as ResumeMarkdownDirectiveSyntaxNode["name"],
          attributes,
          children: nested.nodes,
          line: lineNumber,
        });
      }
      index = nested.nextIndex;
      markdownStart = index;
    }

    flushMarkdown(index);
    return { nodes, nextIndex: index, closed: false };
  }

  const parsed = parseSequence(0, 0);
  return { nodes: parsed.nodes, diagnostics };
}

export function serializeDirectiveAttributes(
  attributes: Array<[string, string | number | boolean | undefined]>,
) {
  const serialized = attributes.flatMap(([key, value]) => {
    if (value === undefined) return [];
    return `${key}=${typeof value === "string" ? JSON.stringify(value) : value}`;
  });
  return serialized.length ? ` {${serialized.join(" ")}}` : "";
}
