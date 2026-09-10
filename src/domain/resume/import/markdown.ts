import type {
  Code,
  Heading,
  Html,
  List,
  ListItem,
  Paragraph,
  Root,
  RootContent,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { createDefaultResumeDocument } from "../default-document";
import {
  createRichTextFromPlainText,
  getPlainTextFromRichText,
} from "../operations";
import {
  type ResumeBlock,
  type ResumeDocument,
  type ResumeSection,
  type RichTextContent,
} from "../schema";
import { validateResumeDocument } from "../validation";
import { createRichTextFromMdast } from "./markdown-rich-text";
import {
  containsMujicvSyntax,
  isMujicvContainerNode,
  normalizeMujicvBlocks,
  type MujicvContainerNode,
  type ResumeMarkdownBlockNode,
} from "./mujicv";
import type {
  DetectedResumeMarkdownDialect,
  ResumeImportDiagnostic,
  ResumeMarkdownImportInput,
  ResumeMarkdownImportResult,
} from "./types";

const MAX_MARKDOWN_BYTES = 512 * 1024;

interface ImportContext {
  diagnostics: ResumeImportDiagnostic[];
  dialect: DetectedResumeMarkdownDialect;
  id: (prefix: string) => string;
}

function createIdFactory() {
  let nextId = 0;

  return (prefix: string) => `${prefix}-import-${++nextId}`;
}

function diagnosticSort(
  left: ResumeImportDiagnostic,
  right: ResumeImportDiagnostic,
) {
  if (left.line !== right.line) {
    return left.line - right.line;
  }

  if (left.severity !== right.severity) {
    return left.severity === "error" ? -1 : 1;
  }

  return left.code.localeCompare(right.code);
}

function createFallbackResult(
  input: ResumeMarkdownImportInput,
  detectedDialect: DetectedResumeMarkdownDialect,
  diagnostics: ResumeImportDiagnostic[],
): ResumeMarkdownImportResult {
  const document = createDefaultResumeDocument(input.locale);

  return {
    document,
    report: {
      requestedDialect: input.dialect,
      detectedDialect,
      sectionCount: document.sections.length,
      diagnostics: diagnostics.sort(diagnosticSort),
    },
  };
}

function getDetectedDialect(input: ResumeMarkdownImportInput) {
  if (input.dialect !== "auto") {
    return input.dialect;
  }

  return containsMujicvSyntax(input.markdown) ? "mujicv" : "standard";
}

function richTextFromBlockNode(
  node: Paragraph | Heading,
  context: ImportContext,
): RichTextContent {
  return createRichTextFromMdast(node.children, {
    diagnostics: context.diagnostics,
    mujicv: context.dialect === "mujicv",
  });
}

function plainTextFromMdast(node: RootContent): string {
  if ("children" in node && Array.isArray(node.children)) {
    return node.children
      .map((child) => plainTextFromMdast(child as RootContent))
      .join("");
  }

  if ("value" in node && typeof node.value === "string") {
    return node.value;
  }

  return "";
}

function createTextBlock(
  context: ImportContext,
  content: RichTextContent,
  style?: Extract<ResumeBlock, { type: "text" }>["style"],
): ResumeBlock {
  return {
    id: context.id("text"),
    type: "text",
    content,
    ...(style ? { style } : {}),
  };
}

function createListBlock(node: List, context: ImportContext): ResumeBlock {
  return {
    id: context.id("list"),
    type: "list",
    ordered: node.ordered ?? false,
    ...(node.ordered ? {} : { marker: "disc" as const }),
    gap: 5,
    items: node.children.map((item) => createListItem(item, context)),
  };
}

function createListItem(node: ListItem, context: ImportContext) {
  const children = node.children.flatMap((child) =>
    blocksFromRootNode(child, context),
  );

  return {
    id: context.id("item"),
    children: children.length
      ? children
      : [createTextBlock(context, createRichTextFromPlainText(" "))],
  };
}

function blocksFromRootNode(
  node: RootContent,
  context: ImportContext,
): ResumeBlock[] {
  switch (node.type) {
    case "paragraph":
      return [createTextBlock(context, richTextFromBlockNode(node, context))];
    case "list":
      return [createListBlock(node, context)];
    case "heading":
      return [
        createTextBlock(context, richTextFromBlockNode(node, context), {
          fontSize: node.depth === 3 ? 17 : 18,
          fontWeight: 700,
        }),
      ];
    case "html": {
      const html = node as Html;
      context.diagnostics.push({
        severity: "warning",
        code: "raw_html_preserved_as_text",
        message: "Raw HTML was preserved as editable text.",
        line: node.position?.start.line ?? 1,
      });
      return [
        createTextBlock(context, createRichTextFromPlainText(html.value)),
      ];
    }
    case "code": {
      const code = node as Code;
      return [
        createTextBlock(context, {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: code.value || " ",
                  marks: [{ type: "code" }],
                },
              ],
            },
          ],
        }),
      ];
    }
    case "blockquote":
      return node.children.flatMap((child) =>
        blocksFromRootNode(child, context),
      );
    case "thematicBreak":
      return [];
    default: {
      const text = plainTextFromMdast(node);
      return text
        ? [createTextBlock(context, createRichTextFromPlainText(text))]
        : [];
    }
  }
}

function alignBlocksRight(blocks: ResumeBlock[]): ResumeBlock[] {
  return blocks.map((block) => {
    if (block.type === "text") {
      return {
        ...block,
        style: { ...block.style, align: "right" },
      };
    }

    if (block.type === "group" || block.type === "row") {
      return { ...block, children: alignBlocksRight(block.children) };
    }

    if (block.type === "list") {
      return {
        ...block,
        items: block.items.map((item) => ({
          ...item,
          children: alignBlocksRight(item.children),
        })),
      };
    }

    return block;
  });
}

function blocksFromContainer(
  container: MujicvContainerNode,
  context: ImportContext,
) {
  const blocks = container.children.flatMap((node) =>
    blocksFromRootNode(node, context),
  );

  return container.side === "right" ? alignBlocksRight(blocks) : blocks;
}

function createContainerGroup(
  container: MujicvContainerNode,
  blocks: ResumeBlock[],
  context: ImportContext,
): ResumeBlock {
  return {
    id: context.id(`group-${container.side}`),
    type: "group",
    direction: "vertical",
    gap: 6,
    align: container.side === "right" ? "end" : "start",
    children: blocks,
  };
}

function appendMappedNode({
  context,
  currentSection,
  index,
  nodes,
}: {
  context: ImportContext;
  currentSection: ResumeSection;
  index: number;
  nodes: ResumeMarkdownBlockNode[];
}) {
  const node = nodes[index]!;

  if (!isMujicvContainerNode(node)) {
    currentSection.blocks.push(...blocksFromRootNode(node, context));
    return 0;
  }

  const ownBlocks = blocksFromContainer(node, context);
  const next = nodes[index + 1];

  if (
    node.side === "left" &&
    next &&
    isMujicvContainerNode(next) &&
    next.side === "right"
  ) {
    const rightBlocks = blocksFromContainer(next, context);

    if (!rightBlocks.length) {
      currentSection.blocks.push(...ownBlocks);
      return 1;
    }

    if (!ownBlocks.length) {
      currentSection.blocks.push(...rightBlocks);
      return 1;
    }

    currentSection.blocks.push({
      id: context.id("row"),
      type: "row",
      gap: 16,
      align: "start",
      justify: "between",
      children: [
        createContainerGroup(node, ownBlocks, context),
        createContainerGroup(next, rightBlocks, context),
      ],
    });
    return 1;
  }

  if (ownBlocks.length) {
    currentSection.blocks.push(createContainerGroup(node, ownBlocks, context));
  }

  context.diagnostics.push({
    severity: "warning",
    code: "mujicv_unpaired_container",
    message: `The Mujicv ${node.side} container has no adjacent pair.`,
    line: node.line,
  });
  return 0;
}

function semanticFromTitle(title: string) {
  const normalized = title.trim().toLocaleLowerCase();

  if (/技能|skills?/.test(normalized)) return "skills";
  if (/教育|education/.test(normalized)) return "education";
  if (/项目|projects?/.test(normalized)) return "projects";
  if (/经历|experience|employment|work/.test(normalized)) return "experience";
  if (/简介|profile|summary/.test(normalized)) return "profile";
  return undefined;
}

function createSection(
  context: ImportContext,
  title?: RichTextContent,
  semantic?: string,
): ResumeSection {
  return {
    id: context.id("section"),
    ...(title ? { title } : {}),
    ...(semantic ? { semantic } : {}),
    visible: true,
    layout: { direction: "vertical", gap: 10 },
    blocks: [],
  };
}

function buildDocument(
  root: Root,
  input: ResumeMarkdownImportInput,
  detectedDialect: DetectedResumeMarkdownDialect,
  diagnostics: ResumeImportDiagnostic[],
) {
  const context: ImportContext = {
    diagnostics,
    dialect: detectedDialect,
    id: createIdFactory(),
  };
  const nodes: ResumeMarkdownBlockNode[] =
    detectedDialect === "mujicv"
      ? normalizeMujicvBlocks(root.children, diagnostics)
      : root.children;
  const sections: ResumeSection[] = [];
  let currentSection: ResumeSection | undefined;
  let title: string | undefined;

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;

    if (!isMujicvContainerNode(node) && node.type === "heading") {
      const heading = node as Heading;
      const richText = richTextFromBlockNode(heading, context);
      const headingText = getPlainTextFromRichText(richText).trim();

      if (heading.depth === 1 && !title) {
        title = headingText;
        currentSection = createSection(context, richText, "profile");
        currentSection.titleStyle = { fontSize: 28 };
        sections.push(currentSection);
        continue;
      }

      if (heading.depth === 2) {
        currentSection = createSection(
          context,
          richText,
          semanticFromTitle(headingText),
        );
        sections.push(currentSection);
        continue;
      }
    }

    if (!currentSection) {
      currentSection = createSection(context);
      sections.push(currentSection);
      diagnostics.push({
        severity: "warning",
        code: "content_before_first_heading",
        message:
          "Content before the first heading was placed in an introductory section.",
        line: isMujicvContainerNode(node)
          ? node.line
          : (node.position?.start.line ?? 1),
      });
    }

    index += appendMappedNode({
      context,
      currentSection,
      index,
      nodes,
    });
  }

  if (!sections.length) {
    sections.push(createSection(context));
  }

  const fallback = createDefaultResumeDocument(input.locale);
  const sortedDiagnostics = diagnostics.sort(diagnosticSort);
  const document: ResumeDocument = {
    ...fallback,
    meta: {
      title: title || fallback.meta.title,
      locale: input.locale,
      import: {
        format: "markdown",
        dialect: detectedDialect,
        importedAt: new Date().toISOString(),
        originalSource: input.markdown,
        diagnostics: sortedDiagnostics,
      },
    },
    sections,
  };

  return validateResumeDocument(document);
}

export function importResumeMarkdown(
  input: ResumeMarkdownImportInput,
): ResumeMarkdownImportResult {
  const detectedDialect = getDetectedDialect(input);
  const diagnostics: ResumeImportDiagnostic[] = [];

  if (!input.markdown.trim()) {
    diagnostics.push({
      severity: "error",
      code: "source_empty",
      message: "Markdown source is empty.",
      line: 1,
    });
    return createFallbackResult(input, detectedDialect, diagnostics);
  }

  if (
    new TextEncoder().encode(input.markdown).byteLength > MAX_MARKDOWN_BYTES
  ) {
    diagnostics.push({
      severity: "error",
      code: "source_too_large",
      message: "Markdown source exceeds 512 KiB.",
      line: 1,
    });
    return createFallbackResult(input, detectedDialect, diagnostics);
  }

  if (input.dialect === "auto" && detectedDialect === "mujicv") {
    const firstDialectLine = input.markdown
      .split("\n")
      .findIndex((line) => /:::\s*(?:left|right)|\bicon:/i.test(line));

    diagnostics.push({
      severity: "warning",
      code: "dialect_auto_detected",
      message: "Mujicv Markdown was detected automatically.",
      line: Math.max(1, firstDialectLine + 1),
    });
  }

  try {
    const root = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .parse(input.markdown);
    const document = buildDocument(root, input, detectedDialect, diagnostics);

    return {
      document,
      report: {
        requestedDialect: input.dialect,
        detectedDialect,
        sectionCount: document.sections.length,
        diagnostics: diagnostics.sort(diagnosticSort),
      },
    };
  } catch {
    diagnostics.push({
      severity: "error",
      code: "markdown_parse_failed",
      message: "Markdown could not be parsed.",
      line: 1,
    });
    return createFallbackResult(input, detectedDialect, diagnostics);
  }
}
