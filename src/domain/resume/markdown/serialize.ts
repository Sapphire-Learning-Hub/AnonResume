import { getResumeFontPresetByFamily } from "../font-presets";
import type { ResumeBlock, ResumeDocument } from "../schema";
import { serializeDirectiveAttributes } from "./directives";
import { serializeResumeMarkdownFrontMatter } from "./frontmatter";
import {
  serializeResumeMarkdownInline,
  type ResumeMarkdownProjectedInlineSpan,
} from "./inline";
import { createResumeMarkdownProjection } from "./projection";
import {
  RESUME_MARKDOWN_SOURCE_VERSION,
  type ResumeMarkdownDiagnostic,
  type ResumeMarkdownProjectionEntry,
  type ResumeMarkdownProjectionNodeKind,
  type ResumeMarkdownSerializeResult,
  type ResumeMarkdownSourceMap,
} from "./types";

interface ProjectionSeed {
  id: string;
  kind: ResumeMarkdownProjectionNodeKind;
  path: number[];
  parentId?: string;
  ordinal: number;
  fingerprint: string;
  inlineSpan?: ResumeMarkdownProjectionEntry["inlineSpan"];
}

interface SerializedFragment {
  source: string;
  seeds: ProjectionSeed[];
}

function fingerprint(value: unknown) {
  return JSON.stringify(value);
}

function blockSeed(
  block: ResumeBlock,
  path: number[],
  parentId: string,
  ordinal: number,
): ProjectionSeed {
  return {
    id: block.id,
    kind: block.type,
    path,
    parentId,
    ordinal,
    fingerprint: `${block.type}:${fingerprint(block)}`,
  };
}

function isSemanticHeading(block: Extract<ResumeBlock, { type: "text" }>) {
  const style = block.style;
  return Boolean(
    style &&
      style.fontSize === 17 &&
      style.fontWeight === 700 &&
      style.lineHeight === undefined &&
      style.color === undefined &&
      style.tone === undefined &&
      style.align === undefined,
  );
}

function serializeInlineContent({
  block,
  path,
  seeds,
}: {
  block: Extract<ResumeBlock, { type: "text" }>;
  path: number[];
  seeds: ProjectionSeed[];
}) {
  let inlineOrdinal = 0;
  return serializeResumeMarkdownInline(block.content, {
    onProjectedSpan(span: ResumeMarkdownProjectedInlineSpan) {
      seeds.push({
        id: `${block.id}:inline:${inlineOrdinal}`,
        kind: "inline-span",
        path,
        parentId: block.id,
        ordinal: inlineOrdinal,
        fingerprint: `inline:${fingerprint(span)}`,
        inlineSpan: span,
      });
      inlineOrdinal += 1;
    },
  });
}

function serializeTextBlock(
  block: Extract<ResumeBlock, { type: "text" }>,
  path: number[],
  parentId: string,
  ordinal: number,
): SerializedFragment {
  const seeds = [blockSeed(block, path, parentId, ordinal)];
  const content = serializeInlineContent({ block, path, seeds });
  return {
    source: isSemanticHeading(block) ? `### ${content}` : content,
    seeds,
  };
}

function indentSource(source: string, width: number) {
  const indentation = " ".repeat(width);
  return source
    .split("\n")
    .map((line) => (line ? `${indentation}${line}` : line))
    .join("\n");
}

function serializeListBlock(
  block: Extract<ResumeBlock, { type: "list" }>,
  path: number[],
  parentId: string,
  ordinal: number,
): SerializedFragment {
  const seeds: ProjectionSeed[] = [blockSeed(block, path, parentId, ordinal)];
  const items = block.items.map((item, itemIndex) => {
    const itemPath = [...path, itemIndex];
    seeds.push({
      id: item.id,
      kind: "list-item",
      path: itemPath,
      parentId: block.id,
      ordinal: itemIndex,
      fingerprint: `list-item:${fingerprint(item)}`,
    });
    const children = item.children.map((child, childIndex) =>
      serializeBlock(
        child,
        [...itemPath, childIndex],
        item.id,
        childIndex,
        { insideRow: false },
      ),
    );
    children.forEach((child) => seeds.push(...child.seeds));

    const marker = block.ordered ? `${itemIndex + 1}.` : "-";
    const indentationWidth = marker.length + 1;
    const [first, ...rest] = children;
    if (!first) return `${marker} `;

    const firstLines = first.source.split("\n");
    const lines = [
      `${marker} ${firstLines[0] ?? ""}`,
      ...firstLines
        .slice(1)
        .map((line) => `${" ".repeat(indentationWidth)}${line}`),
    ];
    for (const [childIndex, child] of rest.entries()) {
      const source = indentSource(child.source, indentationWidth);
      if (item.children[childIndex + 1]?.type !== "list") lines.push("");
      lines.push(source);
    }
    return lines.join("\n");
  });
  return { source: items.join("\n"), seeds };
}

function serializeBadgesBlock(
  block: Extract<ResumeBlock, { type: "badges" }>,
  path: number[],
  parentId: string,
  ordinal: number,
): SerializedFragment {
  const seeds: ProjectionSeed[] = [blockSeed(block, path, parentId, ordinal)];
  block.items.forEach((item, itemIndex) => {
    seeds.push({
      id: item.id,
      kind: "badge",
      path: [...path, itemIndex],
      parentId: block.id,
      ordinal: itemIndex,
      fingerprint: `badge:${item.text}`,
    });
  });
  return {
    source: block.items.map((item) => `- ${item.text}`).join("\n"),
    seeds,
  };
}

function joinFragments(fragments: SerializedFragment[]) {
  return fragments
    .map((fragment) => fragment.source)
    .filter(Boolean)
    .join("\n\n");
}

function canUseHeadingBoundary(block: ResumeBlock) {
  return (
    block.type === "group" &&
    block.direction === "vertical" &&
    block.children[0]?.type === "text" &&
    isSemanticHeading(block.children[0])
  );
}

function serializeGroupBlock(
  block: Extract<ResumeBlock, { type: "group" }>,
  path: number[],
  parentId: string,
  ordinal: number,
  options: { insideRow: boolean },
): SerializedFragment {
  const children = block.children.map((child, childIndex) =>
    serializeBlock(
      child,
      [...path, childIndex],
      block.id,
      childIndex,
      { insideRow: false },
    ),
  );
  const source = joinFragments(children);
  const seeds = [
    blockSeed(block, path, parentId, ordinal),
    ...children.flatMap((child) => child.seeds),
  ];
  const requiresDirective =
    block.direction === "horizontal" ||
    (options.insideRow && !canUseHeadingBoundary(block));
  if (!requiresDirective) return { source, seeds };
  return {
    source: [
      `:::group${serializeDirectiveAttributes([
        ["direction", block.direction === "vertical" ? undefined : block.direction],
        ["gap", block.gap],
        ["align", block.align],
      ])}`,
      source,
      ":::",
    ].join("\n"),
    seeds,
  };
}

function serializeRowBlock(
  block: Extract<ResumeBlock, { type: "row" }>,
  path: number[],
  parentId: string,
  ordinal: number,
): SerializedFragment {
  const children = block.children.map((child, childIndex) =>
    serializeBlock(
      child,
      [...path, childIndex],
      block.id,
      childIndex,
      { insideRow: true },
    ),
  );
  return {
    source: [
      `:::row${serializeDirectiveAttributes([
        ["gap", block.gap],
        ["align", block.align],
        ["justify", block.justify],
      ])}`,
      joinFragments(children),
      ":::",
    ].join("\n"),
    seeds: [
      blockSeed(block, path, parentId, ordinal),
      ...children.flatMap((child) => child.seeds),
    ],
  };
}

function serializeBlock(
  block: ResumeBlock,
  path: number[],
  parentId: string,
  ordinal: number,
  options: { insideRow: boolean },
): SerializedFragment {
  switch (block.type) {
    case "text":
      return serializeTextBlock(block, path, parentId, ordinal);
    case "list":
      return serializeListBlock(block, path, parentId, ordinal);
    case "badges":
      return serializeBadgesBlock(block, path, parentId, ordinal);
    case "group":
      return serializeGroupBlock(block, path, parentId, ordinal, options);
    case "row":
      return serializeRowBlock(block, path, parentId, ordinal);
  }
}

function rangeForLines(lines: string[], startLine: number) {
  const finalLine = lines.at(-1) ?? "";
  return {
    start: { line: startLine, column: 1 },
    end: { line: startLine + lines.length - 1, column: finalLine.length + 1 },
  };
}

export function serializeResumeMarkdown(
  document: ResumeDocument,
  options: { baseDocumentVersion?: number } = {},
): ResumeMarkdownSerializeResult {
  const diagnostics: ResumeMarkdownDiagnostic[] = [];
  const lines = serializeResumeMarkdownFrontMatter({
    version: RESUME_MARKDOWN_SOURCE_VERSION,
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

  for (const [sectionIndex, section] of document.sections.entries()) {
    lines.push("");
    const sectionLine = lines.length + 1;
    const sectionInlineSeeds: ProjectionSeed[] = [];
    const title = section.title
      ? serializeResumeMarkdownInline(section.title, {
          onProjectedSpan(span) {
            sectionInlineSeeds.push({
              id: `${section.id}:inline:${sectionInlineSeeds.length}`,
              kind: "inline-span",
              path: [sectionIndex],
              parentId: section.id,
              ordinal: sectionInlineSeeds.length,
              fingerprint: `inline:${fingerprint(span)}`,
              inlineSpan: span,
            });
          },
        })
      : "Section";
    const sectionSource = `## ${title}`;
    lines.push(sectionSource);
    const sectionRange = rangeForLines([sectionSource], sectionLine);
    sourceMap.sections.push({
      id: section.id,
      kind: "section",
      path: [sectionIndex],
      ordinal: sectionIndex,
      fingerprint: `section:${fingerprint({
        title: section.title,
        semantic: section.semantic,
      })}`,
      ...sectionRange,
    });
    sourceMap.blocks.push(
      ...sectionInlineSeeds.map((seed) => ({ ...seed, ...sectionRange })),
    );

    for (const [blockIndex, block] of section.blocks.entries()) {
      const fragment = serializeBlock(
        block,
        [sectionIndex, blockIndex],
        section.id,
        blockIndex,
        { insideRow: false },
      );
      if (!fragment.source) continue;
      lines.push("");
      const startLine = lines.length + 1;
      const fragmentLines = fragment.source.split("\n");
      lines.push(...fragmentLines);
      const range = rangeForLines(fragmentLines, startLine);
      sourceMap.blocks.push(
        ...fragment.seeds.map((seed) => ({ ...seed, ...range })),
      );
    }
  }

  const source = `${lines.join("\n").trimEnd()}\n`;
  const finalLines = source.split("\n");
  sourceMap.document.end = {
    line: finalLines.length,
    column: (finalLines.at(-1)?.length ?? 0) + 1,
  };
  const projection = createResumeMarkdownProjection(
    document,
    sourceMap,
    options.baseDocumentVersion ?? 0,
  );
  return { source, diagnostics, sourceMap, projection };
}
