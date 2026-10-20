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
  startsWithList?: boolean;
  endsWithList?: boolean;
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
  const codeNode = block.content.content[0]?.content[0];
  if (
    block.content.content.length === 1 &&
    block.content.content[0]?.content.length === 1 &&
    codeNode?.type === "text" &&
    codeNode.marks?.length === 1 &&
    codeNode.marks[0]?.type === "code"
  ) {
    const fence = "`".repeat(
      Math.max(
        3,
        ...Array.from(
          codeNode.text.matchAll(/`+/g),
          (match) => match[0].length + 1,
        ),
      ),
    );
    return { source: `${fence}\n${codeNode.text}\n${fence}`, seeds };
  }
  return {
    source:
      block.content.content.some(
        (paragraph) =>
          !paragraph.content.length ||
          (paragraph.content.some(
            (node) =>
              node.type === "text" &&
              node.marks?.some((mark) => mark.type === "code"),
          ) &&
            paragraph.content.every(
              (node) =>
                node.type === "text" &&
                (!node.text.trim() ||
                  (node.marks?.some((mark) => mark.type === "code") &&
                    node.marks.every((mark) =>
                      ["code", "textColor", "underline", "tag"].includes(
                        mark.type,
                      ),
                    ))),
            )),
      ) || !content
        ? [":::text", content, ":::"].join("\n")
        : isSemanticHeading(block)
          ? `### ${content}`
          : content,
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

function isStandardList(
  block: Extract<ResumeBlock, { type: "list" }>,
): boolean {
  return block.items.every((item) =>
    item.children.every((child) =>
      child.type === "text"
        ? child.content.content.length === 1 &&
          Boolean(child.content.content[0]?.content.length)
        : child.type === "list" && isStandardList(child),
    ),
  );
}

function serializeListBlock(
  block: Extract<ResumeBlock, { type: "list" }>,
  path: number[],
  parentId: string,
  ordinal: number,
): SerializedFragment {
  const seeds: ProjectionSeed[] = [blockSeed(block, path, parentId, ordinal)];
  const requiresDirective = !isStandardList(block);
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
      serializeBlock(child, [...itemPath, childIndex], item.id, childIndex, {
        insideRow: false,
      }),
    );
    children.forEach((child) => seeds.push(...child.seeds));

    if (requiresDirective)
      return [":::item", joinFragments(children), ":::"].join("\n");

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
  return {
    source: requiresDirective
      ? [
          `:::list${serializeDirectiveAttributes([
            ["ordered", block.ordered],
            ["marker", block.marker],
            ["gap", block.gap],
          ])}`,
          items.join("\n\n"),
          ":::",
        ].join("\n")
      : items.join("\n"),
    seeds,
    startsWithList: !requiresDirective,
    endsWithList: !requiresDirective,
  };
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
    source: block.items
      .map((item) =>
        serializeResumeMarkdownInline({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: item.text, marks: [{ type: "code" }] },
              ],
            },
          ],
        }),
      )
      .join(" "),
    seeds,
  };
}

function joinFragments(fragments: SerializedFragment[]) {
  return fragments
    .map(
      (fragment, index) =>
        `${index ? "\n\n" : ""}${fragment.startsWithList && fragments[index - 1]?.endsWithList ? "<!-- anonresume:block -->\n\n" : ""}${fragment.source}`,
    )
    .join("");
}

function serializeGroupBlock(
  block: Extract<ResumeBlock, { type: "group" }>,
  path: number[],
  parentId: string,
  ordinal: number,
  options: { insideRow: boolean },
): SerializedFragment {
  const requiresDirective =
    block.direction === "horizontal" || options.insideRow;
  const children = block.children.map((child, childIndex) =>
    serializeBlock(child, [...path, childIndex], block.id, childIndex, {
      insideRow: block.direction === "horizontal",
    }),
  );
  const source = joinFragments(children);
  const seeds = [
    blockSeed(block, path, parentId, ordinal),
    ...children.flatMap((child) => child.seeds),
  ];
  if (!requiresDirective)
    return {
      source,
      seeds,
      startsWithList: children[0]?.startsWithList,
      endsWithList: children.at(-1)?.endsWithList,
    };
  return {
    source: [
      `:::group${serializeDirectiveAttributes([
        [
          "direction",
          block.direction === "vertical" ? undefined : block.direction,
        ],
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
    serializeBlock(child, [...path, childIndex], block.id, childIndex, {
      insideRow: true,
    }),
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
    case "text": {
      const fragment = serializeTextBlock(block, path, parentId, ordinal);
      return options.insideRow && block.content.content.length > 1
        ? {
            ...fragment,
            source: [":::column", fragment.source, ":::"].join("\n"),
          }
        : fragment;
    }
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
      getResumeFontPresetByFamily(document.settings.typography.fontFamily)
        ?.name ?? document.settings.typography.fontFamily,
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
      : "";
    const sectionSource = title ? `## ${title}` : "##";
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

    const parallel =
      (section.layout?.columns ?? 1) > 1 ||
      section.layout?.direction === "horizontal";
    if (parallel)
      lines.push(
        "",
        `:::layout${serializeDirectiveAttributes([
          ["columns", section.layout?.columns],
          ["direction", section.layout?.direction],
          ["gap", section.layout?.gap],
        ])}`,
      );
    let previousEndsWithList = false;
    for (const [blockIndex, block] of section.blocks.entries()) {
      const fragment = serializeBlock(
        block,
        [sectionIndex, blockIndex],
        section.id,
        blockIndex,
        { insideRow: parallel },
      );
      if (!fragment.source) continue;
      lines.push("");
      if (previousEndsWithList && fragment.startsWithList)
        lines.push("<!-- anonresume:block -->", "");
      previousEndsWithList = fragment.endsWithList ?? false;
      const startLine = lines.length + 1;
      const fragmentLines = fragment.source.split("\n");
      lines.push(...fragmentLines);
      const range = rangeForLines(fragmentLines, startLine);
      sourceMap.blocks.push(
        ...fragment.seeds.map((seed) => ({ ...seed, ...range })),
      );
    }
    if (parallel) lines.push(":::");
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
