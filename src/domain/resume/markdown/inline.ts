import type {
  Delete,
  Emphasis,
  Html,
  InlineCode,
  Link,
  PhrasingContent,
  Root,
  Strong,
  Text,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { RichTextContent } from "../schema";
import type { ResumeMarkdownDiagnostic } from "./types";

type RichTextNode = RichTextContent["content"][number]["content"][number];
type TextMark = NonNullable<
  Extract<RichTextNode, { type: "text" }>["marks"]
>[number];

interface InlineToken {
  type: "tag" | "underline" | "color" | "icon";
  content: string;
  color?: string;
}

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function pushText(output: RichTextNode[], text: string, marks: TextMark[]) {
  if (!text) return;
  const previous = output.at(-1);
  if (
    previous?.type === "text" &&
    JSON.stringify(previous.marks ?? []) === JSON.stringify(marks)
  ) {
    previous.text += text;
    return;
  }
  output.push({
    type: "text",
    text,
    ...(marks.length ? { marks: [...marks] } : {}),
  });
}

function decodeMarkedEdgeSpaces(value: string) {
  return value
    .replace(/^(?:&#32;)+/, (match) => " ".repeat(match.length / 5))
    .replace(/(?:&#32;)+$/, (match) => " ".repeat(match.length / 5));
}

function inlineDiagnostic(
  code: string,
  line: number,
  parameters: Record<string, string | number> = {},
): ResumeMarkdownDiagnostic {
  return { severity: "error", code, parameters, line, column: 1 };
}

function findClosingBracket(source: string, openingIndex: number) {
  let depth = 1;
  for (let index = openingIndex + 1; index < source.length; index += 1) {
    if (source[index - 1] === "\\") continue;
    if (source[index] === "[") depth += 1;
    if (source[index] === "]") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function preprocessDirectives(
  source: string,
  line: number,
  diagnostics: ResumeMarkdownDiagnostic[],
) {
  const tokens: InlineToken[] = [];
  let output = "";
  let cursor = 0;

  while (cursor < source.length) {
    const match = /:([a-z][a-z0-9-]*)\[/i.exec(source.slice(cursor));
    if (!match) {
      output += source.slice(cursor);
      break;
    }

    const start = cursor + match.index;
    const name = match[1]!.toLowerCase();
    output += source.slice(cursor, start);

    if (!["tag", "underline", "color", "icon"].includes(name)) {
      diagnostics.push(inlineDiagnostic("inline_unknown_directive", line, { name }));
      output += match[0];
      cursor = start + match[0].length;
      continue;
    }

    const openingIndex = start + match[0].length - 1;
    const closingIndex = findClosingBracket(source, openingIndex);
    if (closingIndex === -1) {
      diagnostics.push(inlineDiagnostic("inline_unclosed_directive", line, { name }));
      output += source.slice(start);
      break;
    }

    const token: InlineToken = {
      type: name as InlineToken["type"],
      content: source.slice(openingIndex + 1, closingIndex),
    };
    let nextCursor = closingIndex + 1;

    if (name === "color") {
      const attributeMatch = /^\{\s*value=(?:"([^"]+)"|([^\s}]+))\s*\}/.exec(
        source.slice(nextCursor),
      );
      const color = attributeMatch?.[1] ?? attributeMatch?.[2];
      if (!color || !COLOR_PATTERN.test(color)) {
        diagnostics.push(inlineDiagnostic("inline_invalid_color", line));
      } else {
        token.color = color;
        nextCursor += attributeMatch![0].length;
      }
    }

    const tokenIndex = tokens.push(token) - 1;
    output += `\uE000${tokenIndex}\uE001`;
    cursor = nextCursor;
  }

  return { source: output, tokens };
}

function parseLinkAttributes(value: string) {
  const match = /^\{([^}]*)\}/.exec(value);
  if (!match) return undefined;
  const attributes = new Map<string, string>();
  const pattern = /([a-z][a-z-]*)=(?:"([^"]*)"|([^\s]+))/g;
  let item: RegExpExecArray | null;
  while ((item = pattern.exec(match[1]!))) {
    attributes.set(item[1]!, item[2] ?? item[3] ?? "");
  }
  return { attributes, length: match[0].length };
}

function convertText(
  value: string,
  marks: TextMark[],
  tokens: InlineToken[],
  diagnostics: ResumeMarkdownDiagnostic[],
  line: number,
  output: RichTextNode[],
) {
  const placeholderPattern = /\uE000(\d+)\uE001/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = placeholderPattern.exec(value))) {
    pushText(output, value.slice(cursor, match.index), marks);
    const token = tokens[Number(match[1])];
    if (!token) {
      cursor = placeholderPattern.lastIndex;
      continue;
    }
    if (token.type === "icon") {
      if (!token.content.trim()) {
        diagnostics.push(inlineDiagnostic("inline_invalid_icon", line));
      } else {
        output.push({
          type: "resumeIcon",
          attrs: { iconId: token.content.trim() },
        });
      }
    } else {
      const tokenMark: TextMark =
        token.type === "color"
          ? { type: "textColor", attrs: { color: token.color ?? "#000000" } }
          : { type: token.type };
      const nested = parseResumeMarkdownInline(token.content, line, [
        ...marks,
        tokenMark,
      ]);
      diagnostics.push(...nested.diagnostics);
      output.push(...(nested.content.content[0]?.content ?? []));
    }
    cursor = placeholderPattern.lastIndex;
  }
  pushText(output, value.slice(cursor), marks);
}

function convertNodes(
  nodes: PhrasingContent[],
  marks: TextMark[],
  tokens: InlineToken[],
  diagnostics: ResumeMarkdownDiagnostic[],
  line: number,
  output: RichTextNode[],
) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    switch (node.type) {
      case "text":
        convertText((node as Text).value, marks, tokens, diagnostics, line, output);
        break;
      case "break":
        output.push({ type: "hardBreak" });
        break;
      case "inlineCode":
        pushText(output, decodeMarkedEdgeSpaces((node as InlineCode).value), [
          ...marks,
          { type: "code" },
        ]);
        break;
      case "strong":
        convertNodes(
          (node as Strong).children,
          [...marks, { type: "bold" }],
          tokens,
          diagnostics,
          line,
          output,
        );
        break;
      case "emphasis":
        convertNodes(
          (node as Emphasis).children,
          [...marks, { type: "italic" }],
          tokens,
          diagnostics,
          line,
          output,
        );
        break;
      case "delete":
        convertNodes(
          (node as Delete).children,
          [...marks, { type: "strike" }],
          tokens,
          diagnostics,
          line,
          output,
        );
        break;
      case "link": {
        const link = node as Link;
        const next = nodes[index + 1];
        const parsedAttributes =
          next?.type === "text"
            ? parseLinkAttributes((next as Text).value)
            : undefined;
        const color = parsedAttributes?.attributes.get("color");
        const underline = parsedAttributes?.attributes.get("underline");
        const linkMark: TextMark = {
          type: "link",
          attrs: {
            ...(link.url ? { href: link.url } : {}),
            ...(link.title ? { title: link.title } : {}),
            ...(color && (color === "inherit" || COLOR_PATTERN.test(color))
              ? { color }
              : {}),
            ...(underline === "true" || underline === "false"
              ? { underline: underline === "true" }
              : {}),
          },
        };
        convertNodes(
          link.children,
          [...marks, linkMark],
          tokens,
          diagnostics,
          line,
          output,
        );
        if (parsedAttributes && next?.type === "text") {
          (next as Text).value = (next as Text).value.slice(parsedAttributes.length);
        }
        break;
      }
      case "html":
        diagnostics.push(inlineDiagnostic("raw_html_not_allowed", line));
        pushText(output, (node as Html).value, marks);
        break;
      case "image":
        pushText(output, node.alt || node.url, marks);
        break;
      default:
        break;
    }
  }
}

export function parseResumeMarkdownInline(
  source: string,
  line = 1,
  inheritedMarks: TextMark[] = [],
) {
  const diagnostics: ResumeMarkdownDiagnostic[] = [];
  const preprocessed = preprocessDirectives(source, line, diagnostics);
  const root = unified().use(remarkParse).use(remarkGfm).parse(preprocessed.source) as Root;
  const paragraph = root.children.find((node) => node.type === "paragraph");
  const output: RichTextNode[] = [];
  if (paragraph?.type === "paragraph") {
    convertNodes(
      paragraph.children,
      inheritedMarks,
      preprocessed.tokens,
      diagnostics,
      line,
      output,
    );
  }
  return {
    content: {
      type: "doc" as const,
      content: [{ type: "paragraph" as const, content: output }],
    },
    diagnostics,
  };
}

function escapeText(text: string) {
  return text.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function serializeMarkedText(text: string, marks: TextMark[]) {
  let output = escapeText(text);
  if (marks.length) {
    output = output
      .replace(/^ +/, (value) => "&#32;".repeat(value.length))
      .replace(/ +$/, (value) => "&#32;".repeat(value.length));
  }
  for (const mark of [...marks].reverse()) {
    switch (mark.type) {
      case "bold":
        output = `**${output}**`;
        break;
      case "italic":
        output = `_${output}_`;
        break;
      case "strike":
        output = `~~${output}~~`;
        break;
      case "code":
        output = `\`${output.replaceAll("`", "\\`")}\``;
        break;
      case "tag":
        output = `:tag[${output}]`;
        break;
      case "underline":
        output = `:underline[${output}]`;
        break;
      case "textColor":
        output = `:color[${output}]{value=${JSON.stringify(mark.attrs.color)}}`;
        break;
      case "link": {
        const href = mark.attrs?.href ?? (mark.attrs?.title ? "<>" : "");
        const title = mark.attrs?.title
          ? ` ${JSON.stringify(mark.attrs.title)}`
          : "";
        const attributes = [
          ...(mark.attrs?.color ? [`color=${JSON.stringify(mark.attrs.color)}`] : []),
          ...(mark.attrs?.underline === undefined
            ? []
            : [`underline=${mark.attrs.underline}`]),
        ];
        output = `[${output}](${href}${title})${
          attributes.length ? `{${attributes.join(" ")}}` : ""
        }`;
        break;
      }
    }
  }
  return output;
}

export function serializeResumeMarkdownInline(content: RichTextContent) {
  return content.content
    .map((paragraph) =>
      paragraph.content
        .map((node) => {
          if (node.type === "hardBreak") return "  \n";
          if (node.type === "resumeIcon") return `:icon[${node.attrs.iconId}]`;
          return serializeMarkedText(node.text, node.marks ?? []);
        })
        .join(""),
    )
    .join("\n\n");
}
