import { getResumeFontPresetByFamily } from "../font-presets";
import type { ResumeBlock, ResumeDocument } from "../schema";
import { serializeDirectiveAttributes } from "./directives";
import { serializeResumeMarkdownFrontMatter } from "./frontmatter";
import { serializeResumeMarkdownInline } from "./inline";
import type {
  ResumeMarkdownDiagnostic,
  ResumeMarkdownSerializeResult,
  ResumeMarkdownSourceMap,
} from "./types";

function serializeTextBlock(block: Extract<ResumeBlock, { type: "text" }>) {
  const content = serializeResumeMarkdownInline(block.content);
  const style = block.style;
  const headingOnly =
    style &&
    style.fontSize === 17 &&
    style.fontWeight === 700 &&
    style.lineHeight === undefined &&
    style.color === undefined &&
    style.tone === undefined &&
    style.align === undefined;
  if (headingOnly) return `### ${content}`;
  if (!style || Object.keys(style).length === 0) return content;
  return [
    `:::text${serializeDirectiveAttributes([
      ["font-size", style.fontSize],
      ["font-weight", style.fontWeight],
      ["line-height", style.lineHeight],
      ["color", style.color],
      ["tone", style.tone],
      ["align", style.align],
    ])}`,
    content,
    ":::",
  ].join("\n");
}

function isSimpleList(block: Extract<ResumeBlock, { type: "list" }>) {
  return (
    (block.ordered || block.marker === undefined || block.marker === "disc") &&
    block.gap === undefined &&
    block.items.every(
      (item) => item.children.length === 1 && item.children[0]?.type === "text",
    )
  );
}

function serializeSimpleList(block: Extract<ResumeBlock, { type: "list" }>) {
  return block.items
    .map((item, index) => {
      const child = item.children[0];
      const content =
        child?.type === "text" ? serializeResumeMarkdownInline(child.content) : "";
      return `${block.ordered ? `${index + 1}.` : "-"} ${content}`;
    })
    .join("\n");
}

function serializeBlock(block: ResumeBlock): string {
  switch (block.type) {
    case "text":
      return serializeTextBlock(block);
    case "list":
      if (isSimpleList(block)) return serializeSimpleList(block);
      return [
        `:::list${serializeDirectiveAttributes([
          ["ordered", block.ordered ?? false],
          ["marker", block.ordered ? undefined : block.marker],
          ["gap", block.gap],
        ])}`,
        ...block.items.flatMap((item) => [
          ":::item",
          item.children.map(serializeBlock).filter(Boolean).join("\n\n"),
          ":::",
        ]),
        ":::",
      ].join("\n");
    case "badges":
      return [
        `:::badges${serializeDirectiveAttributes([
          ["wrap", block.wrap],
          ["gap", block.gap],
        ])}`,
        ...block.items.map((item) => `- ${item.text}`),
        ":::",
      ].join("\n");
    case "group":
      return [
        `:::group${serializeDirectiveAttributes([
          ["direction", block.direction],
          ["gap", block.gap],
          ["align", block.align],
        ])}`,
        block.children.map(serializeBlock).filter(Boolean).join("\n\n"),
        ":::",
      ].join("\n");
    case "row":
      return [
        `:::row${serializeDirectiveAttributes([
          ["gap", block.gap],
          ["align", block.align],
          ["justify", block.justify],
        ])}`,
        block.children.map(serializeBlock).filter(Boolean).join("\n\n"),
        ":::",
      ].join("\n");
  }
}

function serializeSectionAttributes(section: ResumeDocument["sections"][number]) {
  const padding = section.layout?.padding;
  return serializeDirectiveAttributes([
    ["semantic", section.semantic],
    ["visible", section.visible],
    ["title-color", section.titleStyle?.color],
    ["title-size", section.titleStyle?.fontSize],
    ["columns", section.layout?.columns],
    ["direction", section.layout?.direction],
    ["gap", section.layout?.gap],
    [
      "padding",
      padding
        ? `${padding.top} ${padding.right} ${padding.bottom} ${padding.left}`
        : undefined,
    ],
    ["keep-together", section.pagination?.keepTogether],
  ]);
}

export function serializeResumeMarkdown(
  document: ResumeDocument,
): ResumeMarkdownSerializeResult {
  const diagnostics: ResumeMarkdownDiagnostic[] = [];
  const lines = serializeResumeMarkdownFrontMatter({
    version: 1,
    title: document.meta.title,
    ...(document.meta.locale ? { locale: document.meta.locale } : {}),
    pageMargin: document.settings.page.margin,
    fontFamily:
      getResumeFontPresetByFamily(document.settings.typography.fontFamily)?.name ??
      document.settings.typography.fontFamily,
    fontSize: document.settings.typography.baseFontSize,
    lineHeight: document.settings.typography.lineHeight,
    accent: document.settings.theme.accent,
    textColor: document.settings.theme.textColor,
    mutedColor: document.settings.theme.mutedColor,
  }).split("\n");
  const sourceMap: ResumeMarkdownSourceMap = {
    document: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
    sections: [],
    blocks: [],
  };

  for (const section of document.sections) {
    lines.push("");
    const sectionLine = lines.length + 1;
    const title = section.title
      ? serializeResumeMarkdownInline(section.title)
      : "Section";
    lines.push(`## ${title}${serializeSectionAttributes(section)}`);
    sourceMap.sections.push({
      id: section.id,
      start: { line: sectionLine, column: 1 },
      end: { line: sectionLine, column: lines.at(-1)!.length + 1 },
    });

    for (const block of section.blocks) {
      const value = serializeBlock(block);
      if (!value) continue;
      lines.push("");
      const startLine = lines.length + 1;
      lines.push(...value.split("\n"));
      sourceMap.blocks.push({
        id: block.id,
        start: { line: startLine, column: 1 },
        end: { line: lines.length, column: lines.at(-1)!.length + 1 },
      });
    }
  }

  const source = `${lines.join("\n").trimEnd()}\n`;
  const finalLines = source.split("\n");
  sourceMap.document.end = {
    line: finalLines.length,
    column: (finalLines.at(-1)?.length ?? 0) + 1,
  };
  return { source, diagnostics, sourceMap };
}
