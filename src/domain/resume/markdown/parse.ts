import type { Heading, ListItem, Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { AppLocale } from "@/i18n/messages";

import { listResumeFontPresets } from "../font-presets";
import { createRichTextFromPlainText } from "../operations";
import type {
  ResumeBlock,
  ResumeDocument,
  ResumeListItem,
  ResumeSection,
  RichTextContent,
} from "../schema";
import { validateResumeDocument } from "../validation";
import {
  parseDirectiveAttributes,
  parseResumeMarkdownDirectives,
  type ResumeMarkdownDirectiveSyntaxNode,
  type ResumeMarkdownSyntaxNode,
} from "./directives";
import { parseResumeMarkdownFrontMatter } from "./frontmatter";
import { parseResumeMarkdownInline } from "./inline";
import type {
  ResumeMarkdownDiagnostic,
  ResumeMarkdownParseResult,
  ResumeMarkdownSourceMap,
} from "./types";

interface ParseContext {
  baseDocument: ResumeDocument;
  diagnostics: ResumeMarkdownDiagnostic[];
  sourceMap: ResumeMarkdownSourceMap;
  nextGeneratedId: number;
}

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function diagnostic(
  context: ParseContext,
  code: string,
  line: number,
  parameters: Record<string, string | number> = {},
) {
  context.diagnostics.push({
    severity: "error",
    code,
    parameters,
    line,
    column: 1,
  });
}

function emptySourceMap(source: string): ResumeMarkdownSourceMap {
  const lines = source.split(/\r?\n/);
  return {
    document: {
      start: { line: 1, column: 1 },
      end: { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 },
    },
    sections: [],
    blocks: [],
  };
}

function generatedId(context: ParseContext, prefix: string) {
  context.nextGeneratedId += 1;
  return `${prefix}-markdown-${context.nextGeneratedId}`;
}

function rawNodeSource(source: string, node: RootContent) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? "" : source.slice(start, end);
}

function parseInline(
  source: string,
  line: number,
  context: ParseContext,
): RichTextContent {
  const result = parseResumeMarkdownInline(source, line);
  context.diagnostics.push(...result.diagnostics);
  return result.content;
}

function createTextBlock(
  context: ParseContext,
  id: string,
  content: RichTextContent,
  line: number,
  style?: Extract<ResumeBlock, { type: "text" }>["style"],
): ResumeBlock {
  context.sourceMap.blocks.push({
    id,
    start: { line, column: 1 },
    end: { line, column: 1 },
  });
  return { id, type: "text", content, ...(style ? { style } : {}) };
}

function blocksFromListItem(
  item: ListItem,
  chunkSource: string,
  chunkLine: number,
  context: ParseContext,
  baseItem: ResumeListItem | undefined,
  itemIndex: number,
): ResumeListItem {
  const children = item.children.flatMap((child, childIndex) =>
    blocksFromMdastNode(
      child,
      chunkSource,
      chunkLine,
      context,
      baseItem?.children[childIndex],
      childIndex,
    ),
  );
  return {
    id: baseItem?.id ?? generatedId(context, `item-${itemIndex + 1}`),
    children:
      children.length > 0
        ? children
        : [
            createTextBlock(
              context,
              generatedId(context, "text"),
              createRichTextFromPlainText(" "),
              chunkLine,
            ),
          ],
  };
}

function blockLine(node: RootContent, chunkLine: number) {
  return chunkLine + (node.position?.start.line ?? 1) - 1;
}

function blocksFromMdastNode(
  node: RootContent,
  chunkSource: string,
  chunkLine: number,
  context: ParseContext,
  baseBlock: ResumeBlock | undefined,
  blockIndex: number,
): ResumeBlock[] {
  const id = baseBlock?.id ?? generatedId(context, `block-${blockIndex + 1}`);
  const line = blockLine(node, chunkLine);

  switch (node.type) {
    case "paragraph":
      return [
        createTextBlock(
          context,
          id,
          parseInline(rawNodeSource(chunkSource, node), line, context),
          line,
        ),
      ];
    case "heading": {
      const raw = rawNodeSource(chunkSource, node).replace(/^#{1,6}\s+/, "");
      return [
        createTextBlock(
          context,
          id,
          parseInline(raw, line, context),
          line,
          {
            fontSize: node.depth === 3 ? 17 : 16,
            fontWeight: 700,
          },
        ),
      ];
    }
    case "list": {
      const baseList = baseBlock?.type === "list" ? baseBlock : undefined;
      const block: ResumeBlock = {
        id,
        type: "list",
        ordered: node.ordered ?? false,
        ...(node.ordered ? {} : { marker: "disc" }),
        items: node.children.map((item, index) =>
          blocksFromListItem(
            item,
            chunkSource,
            chunkLine,
            context,
            baseList?.items[index],
            index,
          ),
        ),
      };
      context.sourceMap.blocks.push({
        id,
        start: { line, column: 1 },
        end: { line, column: 1 },
      });
      return [block];
    }
    case "blockquote":
      return node.children.flatMap((child, index) =>
        blocksFromMdastNode(
          child,
          chunkSource,
          chunkLine,
          context,
          undefined,
          index,
        ),
      );
    case "code":
      return [
        createTextBlock(
          context,
          id,
          {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: node.value
                  ? [{ type: "text", text: node.value, marks: [{ type: "code" }] }]
                  : [],
              },
            ],
          },
          line,
        ),
      ];
    case "html":
      diagnostic(context, "raw_html_not_allowed", line);
      return [];
    default:
      return [];
  }
}

function numberAttribute(
  node: ResumeMarkdownDirectiveSyntaxNode,
  name: string,
  context: ParseContext,
  options: { integer?: boolean; min?: number; max?: number } = {},
) {
  const raw = node.attributes[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    (options.integer && !Number.isInteger(value)) ||
    value < (options.min ?? 0) ||
    value > (options.max ?? 96)
  ) {
    diagnostic(context, "block_invalid_attribute", node.line, { name });
    return undefined;
  }
  return value;
}

function booleanAttribute(
  attributes: Record<string, string>,
  name: string,
  line: number,
  context: ParseContext,
) {
  const raw = attributes[name];
  if (raw === undefined) return undefined;
  if (raw !== "true" && raw !== "false") {
    diagnostic(context, "block_invalid_attribute", line, { name });
    return undefined;
  }
  return raw === "true";
}

function enumAttribute<T extends string>(
  node: ResumeMarkdownDirectiveSyntaxNode,
  name: string,
  values: readonly T[],
  context: ParseContext,
) {
  const raw = node.attributes[name];
  if (raw === undefined) return undefined;
  if (!values.includes(raw as T)) {
    diagnostic(context, "block_invalid_attribute", node.line, { name });
    return undefined;
  }
  return raw as T;
}

function checkAllowedAttributes(
  node: ResumeMarkdownDirectiveSyntaxNode,
  allowed: readonly string[],
  context: ParseContext,
) {
  for (const name of Object.keys(node.attributes)) {
    if (!allowed.includes(name)) {
      diagnostic(context, "block_invalid_attribute", node.line, { name });
    }
  }
}

function markdownBlocks(
  source: string,
  line: number,
  context: ParseContext,
  baseBlocks: ResumeBlock[],
) {
  const root = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
  return root.children.flatMap((node, index) =>
    blocksFromMdastNode(
      node,
      source,
      line,
      context,
      baseBlocks[index],
      index,
    ),
  );
}

function richTextFromDirective(
  node: ResumeMarkdownDirectiveSyntaxNode,
  context: ParseContext,
) {
  const paragraphs: RichTextContent["content"] = [];
  for (const child of node.children) {
    if (child.kind !== "markdown") {
      diagnostic(context, "block_invalid_nesting", child.line, { parent: node.name });
      continue;
    }
    const root = unified().use(remarkParse).use(remarkGfm).parse(child.source) as Root;
    for (const mdastNode of root.children) {
      if (mdastNode.type !== "paragraph" && mdastNode.type !== "heading") {
        diagnostic(context, "block_invalid_nesting", child.line, { parent: node.name });
        continue;
      }
      const raw = rawNodeSource(child.source, mdastNode).replace(/^#{1,6}\s+/, "");
      const parsed = parseInline(raw, blockLine(mdastNode, child.line), context);
      paragraphs.push(...parsed.content);
    }
  }
  return { type: "doc" as const, content: paragraphs.length ? paragraphs : [{ type: "paragraph" as const, content: [] }] };
}

function childBlocks(
  nodes: ResumeMarkdownSyntaxNode[],
  context: ParseContext,
  baseBlocks: ResumeBlock[] = [],
): ResumeBlock[] {
  const output: ResumeBlock[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.kind === "markdown") {
      output.push(...markdownBlocks(node.source, node.line, context, baseBlocks.slice(output.length)));
      continue;
    }
    const nextNode = nodes[index + 1];
    if (
      node.name === "left" &&
      nextNode?.kind === "directive" &&
      nextNode.name === "right"
    ) {
      const right = nextNode;
      const id = baseBlocks[output.length]?.id ?? generatedId(context, "row");
      output.push({
        id,
        type: "row",
        gap: 16,
        align: "start",
        justify: "between",
        children: [
          {
            id: generatedId(context, "group-left"),
            type: "group",
            direction: "vertical",
            gap: 6,
            align: "start",
            children: childBlocks(node.children, context),
          },
          {
            id: generatedId(context, "group-right"),
            type: "group",
            direction: "vertical",
            gap: 6,
            align: "end",
            children: childBlocks(right.children, context),
          },
        ],
      });
      index += 1;
      continue;
    }
    output.push(
      ...blocksFromDirective(node, context, baseBlocks[output.length]),
    );
  }
  return output;
}

function blocksFromDirective(
  node: ResumeMarkdownDirectiveSyntaxNode,
  context: ParseContext,
  baseBlock: ResumeBlock | undefined,
): ResumeBlock[] {
  const id = baseBlock?.id ?? generatedId(context, node.name);

  switch (node.name) {
    case "text": {
      checkAllowedAttributes(
        node,
        ["font-size", "font-weight", "line-height", "color", "tone", "align"],
        context,
      );
      const color = node.attributes.color;
      if (color && !COLOR_PATTERN.test(color)) {
        diagnostic(context, "block_invalid_attribute", node.line, { name: "color" });
      }
      return [
        createTextBlock(context, id, richTextFromDirective(node, context), node.line, {
          ...(numberAttribute(node, "font-size", context, { min: 1, max: 72 }) === undefined
            ? {}
            : { fontSize: numberAttribute(node, "font-size", context, { min: 1, max: 72 }) }),
          ...(numberAttribute(node, "font-weight", context, { min: 1, max: 1000 }) === undefined
            ? {}
            : { fontWeight: numberAttribute(node, "font-weight", context, { min: 1, max: 1000 }) }),
          ...(numberAttribute(node, "line-height", context, { min: 0.1, max: 3 }) === undefined
            ? {}
            : { lineHeight: numberAttribute(node, "line-height", context, { min: 0.1, max: 3 }) }),
          ...(color && COLOR_PATTERN.test(color) ? { color } : {}),
          ...(enumAttribute(node, "tone", ["default", "muted", "accent"] as const, context) === undefined
            ? {}
            : { tone: enumAttribute(node, "tone", ["default", "muted", "accent"] as const, context) }),
          ...(enumAttribute(node, "align", ["left", "center", "right"] as const, context) === undefined
            ? {}
            : { align: enumAttribute(node, "align", ["left", "center", "right"] as const, context) }),
        }),
      ];
    }
    case "badges": {
      checkAllowedAttributes(node, ["wrap", "gap"], context);
      const text = node.children
        .filter((child) => child.kind === "markdown")
        .map((child) => child.source)
        .join("\n");
      const items = text
        .split("\n")
        .map((line) => /^\s*[-*+]\s+(.+)$/.exec(line)?.[1]?.trim())
        .filter((item): item is string => Boolean(item));
      if (!items.length) diagnostic(context, "block_invalid_nesting", node.line);
      return [
        {
          id,
          type: "badges",
          wrap: booleanAttribute(node.attributes, "wrap", node.line, context) ?? true,
          ...(numberAttribute(node, "gap", context) === undefined
            ? {}
            : { gap: numberAttribute(node, "gap", context) }),
          items: (items.length ? items : [" "]).map((textValue, index) => ({
            id:
              baseBlock?.type === "badges"
                ? (baseBlock.items[index]?.id ?? generatedId(context, "badge"))
                : generatedId(context, "badge"),
            text: textValue,
          })),
        },
      ];
    }
    case "list": {
      checkAllowedAttributes(node, ["ordered", "marker", "gap"], context);
      const ordered = booleanAttribute(node.attributes, "ordered", node.line, context) ?? false;
      const marker = enumAttribute(node, "marker", ["disc", "square", "dash", "none"] as const, context);
      const itemNodes = node.children.filter(
        (child): child is ResumeMarkdownDirectiveSyntaxNode =>
          child.kind === "directive" && child.name === "item",
      );
      const baseList = baseBlock?.type === "list" ? baseBlock : undefined;
      const items = itemNodes.map((item, index) => ({
        id: baseList?.items[index]?.id ?? generatedId(context, "item"),
        children: childBlocks(item.children, context, baseList?.items[index]?.children),
      }));
      if (!items.length) diagnostic(context, "block_invalid_nesting", node.line);
      return [
        {
          id,
          type: "list",
          ordered,
          ...(!ordered && marker ? { marker } : {}),
          ...(numberAttribute(node, "gap", context) === undefined
            ? {}
            : { gap: numberAttribute(node, "gap", context) }),
          items: items.length
            ? items
            : [
                {
                  id: generatedId(context, "item"),
                  children: [
                    createTextBlock(
                      context,
                      generatedId(context, "text"),
                      createRichTextFromPlainText(" "),
                      node.line,
                    ),
                  ],
                },
              ],
        },
      ];
    }
    case "group":
    case "left":
    case "right": {
      checkAllowedAttributes(node, ["direction", "gap", "align"], context);
      const baseContainer = baseBlock?.type === "group" ? baseBlock : undefined;
      return [
        {
          id,
          type: "group",
          direction:
            enumAttribute(node, "direction", ["vertical", "horizontal"] as const, context) ?? "vertical",
          ...(numberAttribute(node, "gap", context) === undefined
            ? {}
            : { gap: numberAttribute(node, "gap", context) }),
          align:
            node.name === "right"
              ? "end"
              : node.name === "left"
                ? "start"
                : enumAttribute(node, "align", ["start", "center", "end", "stretch"] as const, context),
          children: childBlocks(node.children, context, baseContainer?.children),
        },
      ];
    }
    case "row": {
      checkAllowedAttributes(node, ["gap", "align", "justify"], context);
      const baseRow = baseBlock?.type === "row" ? baseBlock : undefined;
      return [
        {
          id,
          type: "row",
          ...(numberAttribute(node, "gap", context) === undefined
            ? {}
            : { gap: numberAttribute(node, "gap", context) }),
          align: enumAttribute(node, "align", ["start", "center", "end"] as const, context),
          justify: enumAttribute(node, "justify", ["start", "between", "end"] as const, context),
          children: childBlocks(node.children, context, baseRow?.children),
        },
      ];
    }
    case "item":
      diagnostic(context, "block_invalid_nesting", node.line, { name: "item" });
      return [];
  }
}

function parseSectionHeading(
  node: Heading,
  chunkSource: string,
  chunkLine: number,
  context: ParseContext,
  baseSection: ResumeSection | undefined,
  sectionIndex: number,
) {
  const line = blockLine(node, chunkLine);
  const raw = rawNodeSource(chunkSource, node).replace(/^##\s+/, "");
  const attributeMatch = /\s+\{([^{}]*)\}\s*$/.exec(raw);
  const attributeDiagnostics: ResumeMarkdownDiagnostic[] = [];
  const attributes = attributeMatch
    ? parseDirectiveAttributes(attributeMatch[1]!, line, attributeDiagnostics)
    : {};
  context.diagnostics.push(...attributeDiagnostics);
  const titleSource = attributeMatch ? raw.slice(0, attributeMatch.index) : raw;
  const id = baseSection?.id ?? generatedId(context, `section-${sectionIndex + 1}`);
  const visible = booleanAttribute(attributes, "visible", line, context) ?? baseSection?.visible ?? true;
  const titleColor = attributes["title-color"];
  if (titleColor && !COLOR_PATTERN.test(titleColor)) {
    diagnostic(context, "block_invalid_attribute", line, { name: "title-color" });
  }
  const numberFromSection = (name: string, options: { integer?: boolean; min?: number; max?: number } = {}) =>
    numberAttribute({ kind: "directive", name: "group", attributes, children: [], line }, name, context, options);
  const padding = attributes.padding?.split(/\s+/).map(Number);
  if (padding && (padding.length !== 4 || padding.some((value) => !Number.isFinite(value) || value < 0 || value > 96))) {
    diagnostic(context, "block_invalid_attribute", line, { name: "padding" });
  }
  const known = ["semantic", "visible", "title-color", "title-size", "columns", "direction", "gap", "padding", "keep-together"];
  for (const name of Object.keys(attributes)) {
    if (!known.includes(name)) diagnostic(context, "block_invalid_attribute", line, { name });
  }
  const section: ResumeSection = {
    ...(baseSection ? structuredClone(baseSection) : {}),
    id,
    title: parseInline(titleSource, line, context),
    ...(attributes.semantic ? { semantic: attributes.semantic } : baseSection?.semantic ? { semantic: baseSection.semantic } : {}),
    visible,
    titleStyle: {
      ...(titleColor && COLOR_PATTERN.test(titleColor) ? { color: titleColor } : {}),
      ...(numberFromSection("title-size", { min: 1, max: 72 }) === undefined
        ? {}
        : { fontSize: numberFromSection("title-size", { min: 1, max: 72 }) }),
    },
    layout: {
      ...(numberFromSection("columns", { integer: true, min: 1, max: 12 }) === undefined
        ? {}
        : { columns: numberFromSection("columns", { integer: true, min: 1, max: 12 }) }),
      ...(attributes.direction === "vertical" || attributes.direction === "horizontal"
        ? { direction: attributes.direction }
        : {}),
      ...(numberFromSection("gap") === undefined ? {} : { gap: numberFromSection("gap") }),
      ...(padding?.length === 4 && padding.every((value) => Number.isFinite(value) && value >= 0 && value <= 96)
        ? { padding: { top: padding[0]!, right: padding[1]!, bottom: padding[2]!, left: padding[3]! } }
        : {}),
    },
    pagination: {
      ...(booleanAttribute(attributes, "keep-together", line, context) === undefined
        ? {}
        : { keepTogether: booleanAttribute(attributes, "keep-together", line, context) }),
    },
    blocks: [],
  };
  if (!Object.keys(section.titleStyle ?? {}).length) delete section.titleStyle;
  if (!Object.keys(section.layout ?? {}).length) delete section.layout;
  if (!Object.keys(section.pagination ?? {}).length) delete section.pagination;
  context.sourceMap.sections.push({
    id,
    start: { line, column: 1 },
    end: { line, column: 1 },
  });
  return section;
}

function buildSections(nodes: ResumeMarkdownSyntaxNode[], context: ParseContext) {
  const sections: ResumeSection[] = [];
  let currentSection: ResumeSection | undefined;

  const ensureSection = () => {
    if (currentSection) return currentSection;
    const base = context.baseDocument.sections[0];
    currentSection = {
      ...(base ? structuredClone(base) : {}),
      id: base?.id ?? generatedId(context, "section"),
      visible: base?.visible ?? true,
      blocks: [],
    };
    sections.push(currentSection);
    return currentSection;
  };

  for (let syntaxIndex = 0; syntaxIndex < nodes.length; syntaxIndex += 1) {
    const syntax = nodes[syntaxIndex]!;
    if (syntax.kind === "directive") {
      const section = ensureSection();
      const nextNode = nodes[syntaxIndex + 1];
      if (
        syntax.name === "left" &&
        nextNode?.kind === "directive" &&
        nextNode.name === "right"
      ) {
        const right = nextNode;
        section.blocks.push(...childBlocks([syntax, right], context, section.blocks.slice(section.blocks.length)));
        syntaxIndex += 1;
      } else {
        section.blocks.push(...blocksFromDirective(syntax, context, section.blocks[section.blocks.length]));
      }
      continue;
    }

    const root = unified().use(remarkParse).use(remarkGfm).parse(syntax.source) as Root;
    for (const mdastNode of root.children) {
      if (mdastNode.type === "heading" && mdastNode.depth === 2) {
        currentSection = parseSectionHeading(
          mdastNode,
          syntax.source,
          syntax.line,
          context,
          context.baseDocument.sections[sections.length],
          sections.length,
        );
        sections.push(currentSection);
        continue;
      }
      const section = ensureSection();
      section.blocks.push(
        ...blocksFromMdastNode(
          mdastNode,
          syntax.source,
          syntax.line,
          context,
          context.baseDocument.sections[sections.length - 1]?.blocks[section.blocks.length],
          section.blocks.length,
        ),
      );
    }
  }

  if (!sections.length) ensureSection();
  return sections;
}

export function parseResumeMarkdown({
  source,
  baseDocument,
  locale,
}: {
  source: string;
  baseDocument: ResumeDocument;
  locale: AppLocale;
}): ResumeMarkdownParseResult {
  const frontMatterResult = parseResumeMarkdownFrontMatter(source);
  const sourceMap = emptySourceMap(source);
  const diagnostics = [...frontMatterResult.diagnostics];
  if (!frontMatterResult.frontMatter || diagnostics.some((item) => item.severity === "error")) {
    return { diagnostics, sourceMap, hasErrors: true };
  }

  const directiveResult = parseResumeMarkdownDirectives(
    frontMatterResult.body,
    frontMatterResult.bodyStartLine,
  );
  diagnostics.push(...directiveResult.diagnostics);
  if (diagnostics.some((item) => item.severity === "error")) {
    return { diagnostics, sourceMap, hasErrors: true };
  }

  const context: ParseContext = {
    baseDocument,
    diagnostics,
    sourceMap,
    nextGeneratedId: 0,
  };

  try {
    const frontMatter = frontMatterResult.frontMatter;
    const requestedFont = frontMatter.fontFamily;
    const matchedFont = requestedFont
      ? listResumeFontPresets().find(
          (preset) =>
            preset.id === requestedFont ||
            preset.name === requestedFont ||
            preset.fontFamily === requestedFont,
        )
      : undefined;
    const sections = buildSections(directiveResult.nodes, context);
    if (diagnostics.some((item) => item.severity === "error")) {
      return { diagnostics, sourceMap, hasErrors: true };
    }
    const document = validateResumeDocument({
      ...baseDocument,
      meta: {
        ...baseDocument.meta,
        title: frontMatter.title ?? baseDocument.meta.title,
        locale: frontMatter.locale ?? locale,
      },
      settings: {
        page: { size: "A4", margin: frontMatter.pageMargin ?? baseDocument.settings.page.margin },
        typography: {
          fontFamily: matchedFont?.fontFamily ?? baseDocument.settings.typography.fontFamily,
          baseFontSize: frontMatter.fontSize ?? baseDocument.settings.typography.baseFontSize,
          lineHeight: frontMatter.lineHeight ?? baseDocument.settings.typography.lineHeight,
        },
        theme: {
          accent: frontMatter.accent ?? baseDocument.settings.theme.accent,
          textColor: frontMatter.textColor ?? baseDocument.settings.theme.textColor,
          mutedColor: frontMatter.mutedColor ?? baseDocument.settings.theme.mutedColor,
        },
      },
      sections,
    });
    return { document, diagnostics, sourceMap, hasErrors: false };
  } catch {
    diagnostics.push({
      severity: "error",
      code: "document_validation_failed",
      parameters: {},
      line: 1,
      column: 1,
    });
    return { diagnostics, sourceMap, hasErrors: true };
  }
}
