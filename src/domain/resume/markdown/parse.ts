import type {
  Heading,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { AppLocale } from "@/i18n/messages";

import { createRichTextFromMdast } from "../import/markdown-rich-text";
import { listResumeFontPresets } from "../font-presets";
import { createRichTextFromPlainText, getPlainTextFromRichText } from "../operations";
import type {
  ResumeBlock,
  ResumeDocument,
  ResumeListItem,
  ResumeSection,
  RichTextContent,
} from "../schema";
import { validateResumeDocument } from "../validation";
import { parseResumeMarkdownFrontMatter } from "./frontmatter";
import type {
  ResumeMarkdownDiagnostic,
  ResumeMarkdownParseResult,
  ResumeMarkdownSourceMap,
} from "./types";

interface ParseContext {
  baseDocument: ResumeDocument;
  bodyStartLine: number;
  diagnostics: ResumeMarkdownDiagnostic[];
  sourceMap: ResumeMarkdownSourceMap;
  nextGeneratedId: number;
}

function emptySourceMap(source: string): ResumeMarkdownSourceMap {
  const lines = source.split(/\r?\n/);
  return {
    document: {
      start: { line: 1, column: 1 },
      end: {
        line: lines.length,
        column: (lines.at(-1)?.length ?? 0) + 1,
      },
    },
    sections: [],
    blocks: [],
  };
}

function generatedId(context: ParseContext, prefix: string) {
  context.nextGeneratedId += 1;
  return `${prefix}-markdown-${context.nextGeneratedId}`;
}

function absoluteLine(context: ParseContext, line: number | undefined) {
  return context.bodyStartLine + (line ?? 1) - 1;
}

function richTextFromPhrasing(
  children: PhrasingContent[],
  context: ParseContext,
): RichTextContent {
  const importDiagnostics: Array<{
    severity: "warning" | "error";
    code: string;
    message: string;
    line: number;
    column?: number;
  }> = [];
  const content = createRichTextFromMdast(children, {
    diagnostics: importDiagnostics,
    mujicv: false,
  });

  context.diagnostics.push(
    ...importDiagnostics.map((item) => ({
      severity: item.severity,
      code: item.code,
      parameters: {},
      line: absoluteLine(context, item.line),
      column: item.column ?? 1,
    })),
  );
  return content;
}

function sourceEntry(
  id: string,
  node: Pick<RootContent, "position">,
  context: ParseContext,
) {
  return {
    id,
    start: {
      line: absoluteLine(context, node.position?.start.line),
      column: node.position?.start.column ?? 1,
    },
    end: {
      line: absoluteLine(context, node.position?.end.line),
      column: node.position?.end.column ?? 1,
    },
  };
}

function textBlockFromNode(
  node: Paragraph | Heading,
  context: ParseContext,
  id: string,
  style?: Extract<ResumeBlock, { type: "text" }>["style"],
): ResumeBlock {
  const block: ResumeBlock = {
    id,
    type: "text",
    content: richTextFromPhrasing(node.children, context),
    ...(style ? { style } : {}),
  };
  context.sourceMap.blocks.push(sourceEntry(id, node, context));
  return block;
}

function listItemFromNode(
  node: ListItem,
  context: ParseContext,
  baseItem: ResumeListItem | undefined,
  itemIndex: number,
): ResumeListItem {
  const id = baseItem?.id ?? generatedId(context, `item-${itemIndex + 1}`);
  const children = node.children.flatMap((child, childIndex) =>
    blocksFromNode(
      child,
      context,
      baseItem?.children[childIndex],
      childIndex,
    ),
  );

  return {
    id,
    children:
      children.length > 0
        ? children
        : [
            {
              id: baseItem?.children[0]?.id ?? generatedId(context, "text"),
              type: "text",
              content: createRichTextFromPlainText(" "),
            },
          ],
  };
}

function listBlockFromNode(
  node: List,
  context: ParseContext,
  baseBlock: Extract<ResumeBlock, { type: "list" }> | undefined,
  id: string,
): ResumeBlock {
  const block: ResumeBlock = {
    id,
    type: "list",
    ordered: node.ordered ?? false,
    ...(node.ordered ? {} : { marker: baseBlock?.marker ?? ("disc" as const) }),
    ...(baseBlock?.gap === undefined ? {} : { gap: baseBlock.gap }),
    items: node.children.map((item, index) =>
      listItemFromNode(item, context, baseBlock?.items[index], index),
    ),
  };
  context.sourceMap.blocks.push(sourceEntry(id, node, context));
  return block;
}

function blocksFromNode(
  node: RootContent,
  context: ParseContext,
  baseBlock: ResumeBlock | undefined,
  blockIndex: number,
): ResumeBlock[] {
  const id = baseBlock?.id ?? generatedId(context, `block-${blockIndex + 1}`);

  switch (node.type) {
    case "paragraph":
      return [textBlockFromNode(node, context, id, baseBlock?.type === "text" ? baseBlock.style : undefined)];
    case "heading":
      return [
        textBlockFromNode(node, context, id, {
          ...(baseBlock?.type === "text" ? baseBlock.style : {}),
          fontSize: node.depth === 3 ? 17 : 16,
          fontWeight: 700,
        }),
      ];
    case "list":
      return [
        listBlockFromNode(
          node,
          context,
          baseBlock?.type === "list" ? baseBlock : undefined,
          id,
        ),
      ];
    case "blockquote":
      return node.children.flatMap((child, index) =>
        blocksFromNode(child, context, undefined, index),
      );
    case "code": {
      const block: ResumeBlock = {
        id,
        type: "text",
        content: {
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
      };
      context.sourceMap.blocks.push(sourceEntry(id, node, context));
      return [block];
    }
    case "html":
      context.diagnostics.push({
        severity: "warning",
        code: "raw_html_preserved_as_text",
        parameters: {},
        line: absoluteLine(context, node.position?.start.line),
        column: node.position?.start.column ?? 1,
      });
      return [
        {
          id,
          type: "text",
          content: createRichTextFromPlainText(node.value),
        },
      ];
    case "thematicBreak":
      return [];
    default:
      return [];
  }
}

function parseSectionHeading(
  heading: Heading,
  context: ParseContext,
  baseSection: ResumeSection | undefined,
  sectionIndex: number,
) {
  const rawTitle = getPlainTextFromRichText(
    richTextFromPhrasing(heading.children, context),
  );
  const attributeMatch = /\s+\{([^{}]*)\}\s*$/.exec(rawTitle);
  const attributes = new Map<string, string>();

  if (attributeMatch) {
    const attributePattern = /([a-z][a-z-]*)=(?:"([^"]*)"|([^\s]+))/g;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(attributeMatch[1]!))) {
      attributes.set(match[1]!, match[2] ?? match[3] ?? "");
    }
  }

  const title = attributeMatch
    ? rawTitle.slice(0, attributeMatch.index).trimEnd()
    : rawTitle;
  const id = baseSection?.id ?? generatedId(context, `section-${sectionIndex + 1}`);
  const visibleValue = attributes.get("visible");
  const semantic = attributes.get("semantic") ?? baseSection?.semantic;
  const section: ResumeSection = {
    ...(baseSection ? structuredClone(baseSection) : {}),
    id,
    title: createRichTextFromPlainText(title),
    ...(semantic ? { semantic } : {}),
    visible: visibleValue === undefined ? (baseSection?.visible ?? true) : visibleValue !== "false",
    blocks: [],
  };
  context.sourceMap.sections.push(sourceEntry(id, heading, context));
  return section;
}

function buildDocument(
  root: Root,
  context: ParseContext,
  frontMatter: NonNullable<ReturnType<typeof parseResumeMarkdownFrontMatter>["frontMatter"]>,
  locale: AppLocale,
) {
  const requestedFont = frontMatter.fontFamily;
  const matchedFont = requestedFont
    ? listResumeFontPresets().find(
        (preset) =>
          preset.id === requestedFont ||
          preset.name === requestedFont ||
          preset.fontFamily === requestedFont,
      )
    : undefined;
  const sections: ResumeSection[] = [];
  let currentSection: ResumeSection | undefined;

  for (const node of root.children) {
    if (node.type === "heading" && node.depth === 2) {
      currentSection = parseSectionHeading(
        node,
        context,
        context.baseDocument.sections[sections.length],
        sections.length,
      );
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) {
      const baseSection = context.baseDocument.sections[0];
      currentSection = {
        ...(baseSection ? structuredClone(baseSection) : {}),
        id: baseSection?.id ?? generatedId(context, "section-1"),
        visible: baseSection?.visible ?? true,
        blocks: [],
      };
      sections.push(currentSection);
    }

    const baseBlock = context.baseDocument.sections[sections.length - 1]?.blocks[
      currentSection.blocks.length
    ];
    currentSection.blocks.push(
      ...blocksFromNode(node, context, baseBlock, currentSection.blocks.length),
    );
  }

  if (sections.length === 0) {
    const baseSection = context.baseDocument.sections[0];
    sections.push({
      ...(baseSection ? structuredClone(baseSection) : {}),
      id: baseSection?.id ?? generatedId(context, "section-1"),
      visible: baseSection?.visible ?? true,
      blocks: [],
    });
  }

  const base = context.baseDocument;
  return validateResumeDocument({
    ...base,
    meta: {
      ...base.meta,
      title: frontMatter.title ?? base.meta.title,
      locale: frontMatter.locale ?? locale,
    },
    settings: {
      page: {
        size: "A4",
        margin: frontMatter.pageMargin ?? base.settings.page.margin,
      },
      typography: {
        fontFamily: matchedFont?.fontFamily ?? base.settings.typography.fontFamily,
        baseFontSize: frontMatter.fontSize ?? base.settings.typography.baseFontSize,
        lineHeight: frontMatter.lineHeight ?? base.settings.typography.lineHeight,
      },
      theme: {
        accent: frontMatter.accent ?? base.settings.theme.accent,
        textColor: frontMatter.textColor ?? base.settings.theme.textColor,
        mutedColor: frontMatter.mutedColor ?? base.settings.theme.mutedColor,
      },
    },
    sections,
  });
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

  if (
    !frontMatterResult.frontMatter ||
    diagnostics.some((item) => item.severity === "error")
  ) {
    return { diagnostics, sourceMap, hasErrors: true };
  }

  const context: ParseContext = {
    baseDocument,
    bodyStartLine: frontMatterResult.bodyStartLine,
    diagnostics,
    sourceMap,
    nextGeneratedId: 0,
  };

  try {
    const root = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .parse(frontMatterResult.body);
    const document = buildDocument(
      root,
      context,
      frontMatterResult.frontMatter,
      locale,
    );
    return {
      document,
      diagnostics,
      sourceMap,
      hasErrors: diagnostics.some((item) => item.severity === "error"),
    };
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
