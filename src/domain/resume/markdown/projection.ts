import { normalizeResumeDocumentStructure } from "../block-tree";
import { getPlainTextFromRichText } from "../operations";
import type {
  BadgeBlock,
  GroupBlock,
  ListBlock,
  ResumeBlock,
  ResumeDocument,
  ResumeSection,
  RichTextContent,
} from "../schema";
import { serializeResumeMarkdownInline } from "./inline";
import { restoreResumeMarkdownInlinePresentation } from "./inline-projection";
import {
  RESUME_MARKDOWN_PROJECTION_VERSION,
  type ResumeMarkdownDiagnostic,
  type ResumeMarkdownInlineSpan,
  type ResumeMarkdownProjection,
  type ResumeMarkdownProjectionApplyResult,
  type ResumeMarkdownProjectionEntry,
  type ResumeMarkdownProjectionNodeKind,
  type ResumeMarkdownSourceMap,
} from "./types";

function cloneEntry(
  entry: ResumeMarkdownProjectionEntry,
): ResumeMarkdownProjectionEntry {
  return {
    ...entry,
    path: [...entry.path],
    start: { ...entry.start },
    end: { ...entry.end },
    ...(entry.inlineSpan
      ? {
          inlineSpan: {
            ...entry.inlineSpan,
            richTextPath: [
              entry.inlineSpan.richTextPath[0],
              entry.inlineSpan.richTextPath[1],
            ],
          },
        }
      : {}),
  };
}

function entryKey(entry: ResumeMarkdownProjectionEntry) {
  return `${entry.kind}:${entry.id}:${entry.path.join(".")}`;
}

function isProjectionEntry(
  entry: ResumeMarkdownSourceMap["blocks"][number],
): entry is ResumeMarkdownProjectionEntry {
  return Boolean(
    entry.kind &&
    entry.path &&
    entry.ordinal !== undefined &&
    entry.fingerprint !== undefined,
  );
}

function collectBlockEntryKeys({
  block,
  path,
  output,
}: {
  block: ResumeBlock;
  path: number[];
  output: string[];
}) {
  output.push(`${block.type}:${block.id}:${path.join(".")}`);
  switch (block.type) {
    case "text":
      return;
    case "badges":
      block.items.forEach((item, itemIndex) => {
        output.push(`badge:${item.id}:${[...path, itemIndex].join(".")}`);
      });
      return;
    case "list":
      block.items.forEach((item, itemIndex) => {
        const itemPath = [...path, itemIndex];
        output.push(`list-item:${item.id}:${itemPath.join(".")}`);
        item.children.forEach((child, childIndex) => {
          collectBlockEntryKeys({
            block: child,
            path: [...itemPath, childIndex],
            output,
          });
        });
      });
      return;
    case "group":
    case "row":
      block.children.forEach((child, childIndex) => {
        collectBlockEntryKeys({
          block: child,
          path: [...path, childIndex],
          output,
        });
      });
  }
}

export function createResumeMarkdownProjection(
  document: ResumeDocument,
  sourceMap: ResumeMarkdownSourceMap,
  baseDocumentVersion: number,
): ResumeMarkdownProjection {
  const sectionEntries = new Map(
    sourceMap.sections
      .filter(isProjectionEntry)
      .map((entry) => [entryKey(entry), entry]),
  );
  const nodeEntries = new Map(
    sourceMap.blocks
      .filter(isProjectionEntry)
      .map((entry) => [entryKey(entry), entry]),
  );
  const inlineEntriesByParent = new Map<
    string,
    ResumeMarkdownProjectionEntry[]
  >();
  for (const entry of sourceMap.blocks) {
    if (
      !isProjectionEntry(entry) ||
      entry.kind !== "inline-span" ||
      !entry.parentId
    ) {
      continue;
    }
    const bucket = inlineEntriesByParent.get(entry.parentId);
    if (bucket) bucket.push(entry);
    else inlineEntriesByParent.set(entry.parentId, [entry]);
  }

  const sections: ResumeMarkdownProjectionEntry[] = [];
  const orderedNodeKeys: string[] = [];
  for (const [sectionIndex, section] of document.sections.entries()) {
    const sectionPath = [sectionIndex];
    const sectionEntry = sectionEntries.get(
      `section:${section.id}:${sectionPath.join(".")}`,
    );
    if (sectionEntry) sections.push(cloneEntry(sectionEntry));
    for (const inlineEntry of [
      ...(inlineEntriesByParent.get(section.id) ?? []),
    ].sort((left, right) => left.ordinal - right.ordinal)) {
      orderedNodeKeys.push(entryKey(inlineEntry));
    }
    section.blocks.forEach((block, blockIndex) => {
      collectBlockEntryKeys({
        block,
        path: [sectionIndex, blockIndex],
        output: orderedNodeKeys,
      });
    });
  }

  const nodes: ResumeMarkdownProjectionEntry[] = [];
  for (const key of orderedNodeKeys) {
    const entry = nodeEntries.get(key);
    if (!entry) continue;
    nodes.push(cloneEntry(entry));
    for (const inlineEntry of [
      ...(inlineEntriesByParent.get(entry.id) ?? []),
    ].sort((left, right) => left.ordinal - right.ordinal)) {
      nodes.push(cloneEntry(inlineEntry));
    }
  }

  return {
    version: RESUME_MARKDOWN_PROJECTION_VERSION,
    baseDocumentVersion,
    sections,
    nodes,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodePoint(value: unknown) {
  if (!isRecord(value)) return undefined;
  const { line, column } = value;
  if (
    typeof line !== "number" ||
    !Number.isInteger(line) ||
    line < 1 ||
    typeof column !== "number" ||
    !Number.isInteger(column) ||
    column < 1
  ) {
    return undefined;
  }
  return { line, column };
}

const NODE_KINDS = new Set<ResumeMarkdownProjectionNodeKind>([
  "section",
  "image",
  "text",
  "list",
  "list-item",
  "badges",
  "badge",
  "group",
  "row",
  "inline-span",
]);

function decodeInlineSpan(
  value: unknown,
): ResumeMarkdownInlineSpan | undefined {
  if (!isRecord(value)) return undefined;
  const { richTextPath, start, end, contextFingerprint, mark, color } = value;
  if (
    !Array.isArray(richTextPath) ||
    richTextPath.length !== 2 ||
    !richTextPath.every(
      (item) => typeof item === "number" && Number.isInteger(item) && item >= 0,
    ) ||
    typeof start !== "number" ||
    !Number.isInteger(start) ||
    start < 0 ||
    typeof end !== "number" ||
    !Number.isInteger(end) ||
    end < start ||
    typeof contextFingerprint !== "string" ||
    !["tag", "underline", "textColor"].includes(String(mark)) ||
    (color !== undefined && typeof color !== "string")
  ) {
    return undefined;
  }
  return {
    richTextPath: [richTextPath[0] as number, richTextPath[1] as number],
    start,
    end,
    contextFingerprint,
    mark: mark as ResumeMarkdownInlineSpan["mark"],
    ...(typeof color === "string" ? { color } : {}),
  };
}

function decodeEntry(
  value: unknown,
): ResumeMarkdownProjectionEntry | undefined {
  if (!isRecord(value)) return undefined;
  const {
    id,
    kind,
    path,
    parentId,
    ordinal,
    fingerprint,
    start,
    end,
    inlineSpan,
  } = value;
  const decodedStart = decodePoint(start);
  const decodedEnd = decodePoint(end);
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof kind !== "string" ||
    !NODE_KINDS.has(kind as ResumeMarkdownProjectionNodeKind) ||
    !Array.isArray(path) ||
    !path.every(
      (item) => typeof item === "number" && Number.isInteger(item) && item >= 0,
    ) ||
    (parentId !== undefined && typeof parentId !== "string") ||
    typeof ordinal !== "number" ||
    !Number.isInteger(ordinal) ||
    ordinal < 0 ||
    typeof fingerprint !== "string" ||
    !decodedStart ||
    !decodedEnd
  ) {
    return undefined;
  }
  const decodedInlineSpan =
    kind === "inline-span" ? decodeInlineSpan(inlineSpan) : undefined;
  if (kind === "inline-span" && !decodedInlineSpan) return undefined;
  return {
    id,
    kind: kind as ResumeMarkdownProjectionNodeKind,
    path: path.map((item) => item as number),
    ...(typeof parentId === "string" ? { parentId } : {}),
    ordinal,
    fingerprint,
    start: decodedStart,
    end: decodedEnd,
    ...(decodedInlineSpan ? { inlineSpan: decodedInlineSpan } : {}),
  };
}

function decodeEntries(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const entries: ResumeMarkdownProjectionEntry[] = [];
  for (const item of value) {
    const entry = decodeEntry(item);
    if (!entry) return undefined;
    entries.push(entry);
  }
  return entries;
}

export function decodeResumeMarkdownProjection(
  value: unknown,
): ResumeMarkdownProjection | undefined {
  if (!isRecord(value)) return undefined;
  const { version, baseDocumentVersion } = value;
  const sections = decodeEntries(value.sections);
  const nodes = decodeEntries(value.nodes);
  if (
    version !== RESUME_MARKDOWN_PROJECTION_VERSION ||
    typeof baseDocumentVersion !== "number" ||
    !Number.isInteger(baseDocumentVersion) ||
    baseDocumentVersion < 0 ||
    !sections ||
    !nodes
  ) {
    return undefined;
  }
  return {
    version: RESUME_MARKDOWN_PROJECTION_VERSION,
    baseDocumentVersion,
    sections,
    nodes,
  };
}

type RichTextNode = RichTextContent["content"][number]["content"][number];
type TextNode = Extract<RichTextNode, { type: "text" }>;
type TextMark = NonNullable<TextNode["marks"]>[number];

interface FlattenedBlock {
  block: ResumeBlock;
  wrappers: Array<GroupBlock | Extract<ResumeBlock, { type: "text" }>>;
}

interface SiblingMatches {
  baseIndexes: Array<number | undefined>;
  degraded: boolean;
}

type ExplicitAttributes = Map<string, Set<string>>;

function semanticRichText(content: RichTextContent | undefined) {
  if (!content) return null;
  return content.content.map((paragraph) =>
    paragraph.content.map((node) => {
      if (node.type !== "text") return node;
      const marks: TextMark[] = [];
      for (const mark of node.marks ?? []) {
        if (
          mark.type === "tag" ||
          mark.type === "underline" ||
          mark.type === "textColor"
        ) {
          continue;
        }
        if (mark.type !== "link") {
          marks.push({ type: mark.type });
        } else {
          marks.push({
            type: "link",
            attrs: {
              ...(mark.attrs?.href ? { href: mark.attrs.href } : {}),
              ...(mark.attrs?.title ? { title: mark.attrs.title } : {}),
            },
          });
        }
      }
      return {
        type: "text",
        text: node.text,
        ...(marks.length ? { marks } : {}),
      };
    }),
  );
}

function simpleListTexts(block: ResumeBlock): string[] | undefined {
  if (block.type === "badges") {
    return block.items.map((item) => item.text);
  }
  if (block.type !== "list" || block.ordered) return undefined;
  const texts: string[] = [];
  for (const item of block.items) {
    if (item.children.length !== 1 || item.children[0]?.type !== "text") {
      return undefined;
    }
    texts.push(getPlainTextFromRichText(item.children[0].content));
  }
  return texts;
}

function blockSemanticKey(block: ResumeBlock): string {
  const simpleTexts = simpleListTexts(block);
  if (simpleTexts) return `collection:${JSON.stringify(simpleTexts)}`;
  switch (block.type) {
    case "image":
      return `image:${block.assetId}:${block.alt}`;
    case "text":
      return `text:${JSON.stringify(semanticRichText(block.content))}`;
    case "badges":
      return `badges:${JSON.stringify(block.items.map((item) => item.text))}`;
    case "list":
      return `list:${block.ordered ?? false}:${block.items
        .map((item) =>
          item.children.map((child) => blockSemanticKey(child)).join("\u0001"),
        )
        .join("\u0002")}`;
    case "group":
    case "row":
      return `${block.type}:${block.children
        .map((child) => blockSemanticKey(child))
        .join("\u0001")}`;
  }
}

function sectionSemanticKey(section: ResumeSection) {
  return JSON.stringify({
    title: semanticRichText(section.title),
  });
}

function isSimpleList(block: ResumeBlock): block is ListBlock {
  return block.type === "list" && simpleListTexts(block) !== undefined;
}

function compatibleBlocks(base: ResumeBlock, parsed: ResumeBlock) {
  return (
    base.type === parsed.type ||
    (base.type === "badges" && isSimpleList(parsed))
  );
}

function matchSiblings<T>({
  baseItems,
  parsedItems,
  semanticKey,
  compatible,
}: {
  baseItems: T[];
  parsedItems: T[];
  semanticKey: (item: T) => string;
  compatible: (base: T, parsed: T) => boolean;
}): SiblingMatches {
  const baseIndexes: Array<number | undefined> = parsedItems.map(
    () => undefined,
  );
  const usedBase = new Set<number>();
  const buckets = new Map<string, number[]>();
  baseItems.forEach((item, index) => {
    const key = semanticKey(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  });

  for (const [parsedIndex, parsed] of parsedItems.entries()) {
    const bucket = buckets.get(semanticKey(parsed)) ?? [];
    const positionalIndex = bucket.includes(parsedIndex)
      ? parsedIndex
      : undefined;
    const baseIndex =
      positionalIndex !== undefined &&
      !usedBase.has(positionalIndex) &&
      compatible(baseItems[positionalIndex]!, parsed)
        ? positionalIndex
        : bucket.find(
            (candidateIndex) =>
              !usedBase.has(candidateIndex) &&
              compatible(baseItems[candidateIndex]!, parsed),
          );
    if (baseIndex === undefined) continue;
    baseIndexes[parsedIndex] = baseIndex;
    usedBase.add(baseIndex);
  }

  const anchors = baseIndexes.flatMap((baseIndex, parsedIndex) =>
    baseIndex === undefined ? [] : [{ baseIndex, parsedIndex }],
  );
  const monotonic = anchors.every(
    (anchor, index) =>
      index === 0 || anchors[index - 1]!.baseIndex < anchor.baseIndex,
  );
  let degraded = false;

  if (anchors.length === 0 || monotonic) {
    const boundaries = [
      { baseIndex: -1, parsedIndex: -1 },
      ...anchors,
      { baseIndex: baseItems.length, parsedIndex: parsedItems.length },
    ];
    for (
      let boundaryIndex = 0;
      boundaryIndex < boundaries.length - 1;
      boundaryIndex += 1
    ) {
      const left = boundaries[boundaryIndex]!;
      const right = boundaries[boundaryIndex + 1]!;
      const baseGap = Array.from(
        { length: Math.max(0, right.baseIndex - left.baseIndex - 1) },
        (_, offset) => left.baseIndex + offset + 1,
      ).filter((index) => !usedBase.has(index));
      const parsedGap = Array.from(
        { length: Math.max(0, right.parsedIndex - left.parsedIndex - 1) },
        (_, offset) => left.parsedIndex + offset + 1,
      ).filter((index) => baseIndexes[index] === undefined);

      if (
        baseGap.length === parsedGap.length &&
        baseGap.every((baseIndex, index) =>
          compatible(baseItems[baseIndex]!, parsedItems[parsedGap[index]!]!),
        )
      ) {
        baseGap.forEach((baseIndex, index) => {
          const parsedIndex = parsedGap[index]!;
          baseIndexes[parsedIndex] = baseIndex;
          usedBase.add(baseIndex);
        });
      } else if (
        baseGap.some((baseIndex) =>
          parsedGap.some((parsedIndex) =>
            compatible(baseItems[baseIndex]!, parsedItems[parsedIndex]!),
          ),
        )
      ) {
        degraded = true;
      }
    }
  } else {
    const unmatchedBase = baseItems.filter((_, index) => !usedBase.has(index));
    const unmatchedParsed = parsedItems.filter(
      (_, index) => baseIndexes[index] === undefined,
    );
    degraded = unmatchedBase.some((base) =>
      unmatchedParsed.some((parsed) => compatible(base, parsed)),
    );
  }

  return { baseIndexes, degraded };
}

function flattenTransparentGroups(
  blocks: ResumeBlock[],
  wrappers: GroupBlock[] = [],
): FlattenedBlock[] {
  return blocks.flatMap((block) =>
    block.type === "group" && block.direction === "vertical"
      ? flattenTransparentGroups(block.children, [...wrappers, block])
      : [{ block, wrappers }],
  );
}

function expandTextParagraphs(items: FlattenedBlock[]): FlattenedBlock[] {
  return items.flatMap((item) => {
    const block = item.block;
    return block.type === "text" && block.content.content.length > 1
      ? block.content.content.map((paragraph) => ({
          block: {
            ...block,
            content: { type: "doc" as const, content: [paragraph] },
          },
          wrappers: [...item.wrappers, block],
        }))
      : [item];
  });
}

function sameWrapperChain(
  left: FlattenedBlock["wrappers"],
  right: FlattenedBlock["wrappers"],
) {
  return (
    left.length === right.length &&
    left.every((wrapper, index) => wrapper.id === right[index]?.id)
  );
}

function inferInsertedWrapperChains(items: FlattenedBlock[]) {
  return items.map((item, index) => {
    if (item.wrappers.length > 0) return item;
    const previous = items[index - 1];
    const next = items[index + 1];
    return previous &&
      next &&
      previous.wrappers.length > 0 &&
      (item.block.type === "text" ||
        !previous.wrappers.some((wrapper) => wrapper.type === "text")) &&
      sameWrapperChain(previous.wrappers, next.wrappers)
      ? { ...item, wrappers: previous.wrappers }
      : item;
  });
}

function rebuildTransparentGroups(
  items: FlattenedBlock[],
  depth = 0,
): ResumeBlock[] {
  const output: ResumeBlock[] = [];
  let index = 0;
  while (index < items.length) {
    const wrapper = items[index]!.wrappers[depth];
    if (!wrapper) {
      output.push(items[index]!.block);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (
      end < items.length &&
      items[end]!.wrappers[depth]?.id === wrapper.id
    ) {
      end += 1;
    }
    const children = rebuildTransparentGroups(
      items.slice(index, end),
      depth + 1,
    );
    if (wrapper.type === "text") {
      const first = children[0];
      output.push({
        ...wrapper,
        ...(first?.type === "text" ? first : {}),
        id: wrapper.id,
        content: {
          type: "doc",
          content: children.flatMap((child) =>
            child.type === "text" ? child.content.content : [],
          ),
        },
      });
    } else output.push({ ...wrapper, children });
    index = end;
  }
  return output;
}

function reconcileBadgeItems(base: BadgeBlock, items: BadgeBlock["items"]) {
  const matches = matchSiblings({
    baseItems: base.items,
    parsedItems: items,
    semanticKey: (item) => item.text,
    compatible: () => true,
  });
  return items.map((item, index) => {
    const baseIndex = matches.baseIndexes[index];
    return {
      id: baseIndex === undefined ? item.id : base.items[baseIndex]!.id,
      text: item.text,
    };
  });
}

function reconcileListItems({
  base,
  parsed,
  projection,
  attributes,
}: {
  base: ListBlock;
  parsed: ListBlock;
  projection: ResumeMarkdownProjection;
  attributes: ExplicitAttributes;
}) {
  const matches = matchSiblings({
    baseItems: base.items,
    parsedItems: parsed.items,
    semanticKey: (item) =>
      item.children.map((child) => blockSemanticKey(child)).join("\u0001"),
    compatible: () => true,
  });
  let degraded = matches.degraded;
  const items = parsed.items.map((item, index) => {
    const baseIndex = matches.baseIndexes[index];
    if (baseIndex === undefined) return item;
    const baseItem = base.items[baseIndex]!;
    const children = reconcileBlocks({
      baseBlocks: baseItem.children,
      parsedBlocks: item.children,
      projection,
      flattenGroups: true,
      attributes,
    });
    degraded ||= children.degraded;
    return { ...item, id: baseItem.id, children: children.blocks };
  });
  return { items, degraded };
}

function reconcileBlock({
  base,
  parsed,
  projection,
  attributes,
}: {
  base: ResumeBlock;
  parsed: ResumeBlock;
  projection: ResumeMarkdownProjection;
  attributes: ExplicitAttributes;
}): { block: ResumeBlock; degraded: boolean } {
  if (base.type === "badges" && isSimpleList(parsed)) {
    const texts = simpleListTexts(parsed) ?? [];
    return {
      block: {
        ...base,
        items: reconcileBadgeItems(
          base,
          texts.map((text, index) => ({ id: parsed.items[index]!.id, text })),
        ),
      },
      degraded: false,
    };
  }
  if (base.type !== parsed.type) {
    return { block: parsed, degraded: true };
  }
  switch (parsed.type) {
    case "image":
      return { block: { ...parsed, id: base.id, ...(base.type === "image" && base.assetId === parsed.assetId ? { intrinsicWidth: base.intrinsicWidth, intrinsicHeight: base.intrinsicHeight } : {}) }, degraded: false };
    case "text": {
      const baseText = base as Extract<ResumeBlock, { type: "text" }>;
      const restored = restoreResumeMarkdownInlinePresentation(
        baseText.content,
        parsed.content,
      );
      return {
        block: {
          ...baseText,
          ...parsed,
          id: baseText.id,
          content: restored.content,
          style:
            baseText.style || parsed.style
              ? { ...baseText.style, ...parsed.style }
              : undefined,
        },
        degraded: restored.degraded,
      };
    }
    case "badges": {
      const baseBadges = base as BadgeBlock;
      return {
        block: {
          ...baseBadges,
          ...parsed,
          id: baseBadges.id,
          wrap: attributes.get(parsed.id)?.has("wrap")
            ? parsed.wrap
            : baseBadges.wrap,
          gap: parsed.gap ?? baseBadges.gap,
          items: reconcileBadgeItems(baseBadges, parsed.items),
        },
        degraded: false,
      };
    }
    case "list": {
      const baseList = base as ListBlock;
      const reconciled = reconcileListItems({
        base: baseList,
        parsed,
        projection,
        attributes,
      });
      return {
        block: {
          ...base,
          ...parsed,
          id: base.id,
          ordered: parsed.ordered
            ? true
            : baseList.ordered === false
              ? false
              : undefined,
          marker: parsed.ordered
            ? parsed.marker
            : attributes.get(parsed.id)?.has("marker")
              ? parsed.marker
              : baseList.marker,
          gap: parsed.gap ?? baseList.gap,
          items: reconciled.items,
        },
        degraded: reconciled.degraded,
      };
    }
    case "group":
    case "row": {
      const baseContainer = base as Extract<
        ResumeBlock,
        { type: "group" | "row" }
      >;
      const children = reconcileBlocks({
        baseBlocks: baseContainer.children,
        parsedBlocks: parsed.children,
        projection,
        flattenGroups:
          baseContainer.type === "group" &&
          baseContainer.direction === "vertical",
        attributes,
      });
      if (parsed.type === "group" && baseContainer.type === "group") {
        return {
          block: {
            ...baseContainer,
            ...parsed,
            id: baseContainer.id,
            gap: parsed.gap ?? baseContainer.gap,
            align: parsed.align ?? baseContainer.align,
            children: children.blocks,
          },
          degraded: children.degraded,
        };
      }
      if (parsed.type === "row" && baseContainer.type === "row") {
        return {
          block: {
            ...baseContainer,
            ...parsed,
            id: baseContainer.id,
            gap: parsed.gap ?? baseContainer.gap,
            align: parsed.align ?? baseContainer.align,
            justify: parsed.justify ?? baseContainer.justify,
            columnLayout: parsed.columnLayout,
            children: children.blocks,
          },
          degraded: children.degraded,
        };
      }
      return { block: parsed, degraded: true };
    }
  }
}

function reconcileBlocks({
  baseBlocks,
  parsedBlocks,
  projection,
  flattenGroups,
  attributes,
}: {
  baseBlocks: ResumeBlock[];
  parsedBlocks: ResumeBlock[];
  projection: ResumeMarkdownProjection;
  flattenGroups: boolean;
  attributes: ExplicitAttributes;
}) {
  const groupedBase = flattenGroups
    ? flattenTransparentGroups(baseBlocks)
    : baseBlocks.map((block) => ({ block, wrappers: [] }));
  const flattenedBase = expandTextParagraphs(groupedBase);
  const expandedParsedBlocks = splitMergedProjectedLists(
    groupedBase,
    parsedBlocks,
  );
  const parsedItems = expandTextParagraphs(
    expandedParsedBlocks.map((block) => ({ block, wrappers: [] })),
  );
  const matches = matchSiblings({
    baseItems: flattenedBase,
    parsedItems,
    semanticKey: (item) => blockSemanticKey(item.block),
    compatible: (base, parsed) => compatibleBlocks(base.block, parsed.block),
  });
  let degraded = matches.degraded;
  const reconciled = parsedItems.map<FlattenedBlock>((parsedItem, index) => {
    const parsed = parsedItem.block;
    const baseIndex = matches.baseIndexes[index];
    if (baseIndex === undefined) return parsedItem;
    const matched = flattenedBase[baseIndex]!;
    const result = reconcileBlock({
      base: matched.block,
      parsed,
      projection,
      attributes,
    });
    degraded ||= result.degraded;
    return { block: result.block, wrappers: matched.wrappers };
  });
  return {
    blocks: rebuildTransparentGroups(inferInsertedWrapperChains(reconciled)),
    degraded,
  };
}

function splitMergedProjectedLists(
  baseItems: FlattenedBlock[],
  parsedBlocks: ResumeBlock[],
) {
  if (baseItems.length <= parsedBlocks.length) return parsedBlocks;
  const output: ResumeBlock[] = [];
  let baseCursor = 0;
  for (const parsed of parsedBlocks) {
    const base = baseItems[baseCursor]?.block;
    if (
      parsed.type !== "list" ||
      !base ||
      simpleListTexts(base) === undefined
    ) {
      output.push(parsed);
      baseCursor += 1;
      continue;
    }
    const collectionRun: ResumeBlock[] = [];
    let expectedItemCount = 0;
    for (let index = baseCursor; index < baseItems.length; index += 1) {
      const candidate = baseItems[index]!.block;
      const texts = simpleListTexts(candidate);
      if (!texts) break;
      collectionRun.push(candidate);
      expectedItemCount += texts.length;
      if (expectedItemCount >= parsed.items.length) break;
    }
    if (collectionRun.length < 2 || expectedItemCount !== parsed.items.length) {
      output.push(parsed);
      baseCursor += 1;
      continue;
    }
    let itemCursor = 0;
    collectionRun.forEach((candidate, index) => {
      const itemCount = simpleListTexts(candidate)?.length ?? 0;
      output.push({
        ...parsed,
        id: index === 0 ? parsed.id : `${parsed.id}-split-${index}`,
        items: parsed.items.slice(itemCursor, itemCursor + itemCount),
      });
      itemCursor += itemCount;
    });
    baseCursor += collectionRun.length;
  }
  return output;
}

function projectionRange(sourceMap: ResumeMarkdownSourceMap) {
  return {
    start: { ...sourceMap.document.start },
    end: { ...sourceMap.document.end },
  };
}

function createRebasedProjection(
  document: ResumeDocument,
  sourceMap: ResumeMarkdownSourceMap,
  baseDocumentVersion: number,
) {
  const range = projectionRange(sourceMap);
  const map: ResumeMarkdownSourceMap = {
    document: range,
    sections: [],
    blocks: [],
  };
  const visit = (
    block: ResumeBlock,
    path: number[],
    parentId: string,
    ordinal: number,
  ) => {
    map.blocks.push({
      id: block.id,
      kind: block.type,
      path,
      parentId,
      ordinal,
      fingerprint: `${block.type}:${JSON.stringify(block)}`,
      ...range,
    });
    if (block.type === "text") {
      let inlineOrdinal = 0;
      serializeResumeMarkdownInline(block.content, {
        onProjectedSpan(span) {
          map.blocks.push({
            id: `${block.id}:inline:${inlineOrdinal}`,
            kind: "inline-span",
            path,
            parentId: block.id,
            ordinal: inlineOrdinal,
            fingerprint: `inline:${JSON.stringify(span)}`,
            inlineSpan: span,
            ...range,
          });
          inlineOrdinal += 1;
        },
      });
      return;
    }
    if (block.type === "badges") {
      block.items.forEach((item, itemIndex) => {
        map.blocks.push({
          id: item.id,
          kind: "badge",
          path: [...path, itemIndex],
          parentId: block.id,
          ordinal: itemIndex,
          fingerprint: `badge:${item.text}`,
          ...range,
        });
      });
      return;
    }
    if (block.type === "list") {
      block.items.forEach((item, itemIndex) => {
        const itemPath = [...path, itemIndex];
        map.blocks.push({
          id: item.id,
          kind: "list-item",
          path: itemPath,
          parentId: block.id,
          ordinal: itemIndex,
          fingerprint: `list-item:${JSON.stringify(item)}`,
          ...range,
        });
        item.children.forEach((child, childIndex) =>
          visit(child, [...itemPath, childIndex], item.id, childIndex),
        );
      });
      return;
    }
    if (block.type === "image") return;
    block.children.forEach((child, childIndex) =>
      visit(child, [...path, childIndex], block.id, childIndex),
    );
  };
  document.sections.forEach((section, sectionIndex) => {
    map.sections.push({
      id: section.id,
      kind: "section",
      path: [sectionIndex],
      ordinal: sectionIndex,
      fingerprint: `section:${sectionSemanticKey(section)}`,
      ...range,
    });
    if (section.title) {
      let inlineOrdinal = 0;
      serializeResumeMarkdownInline(section.title, {
        onProjectedSpan(span) {
          map.blocks.push({
            id: `${section.id}:inline:${inlineOrdinal}`,
            kind: "inline-span",
            path: [sectionIndex],
            parentId: section.id,
            ordinal: inlineOrdinal,
            fingerprint: `inline:${JSON.stringify(span)}`,
            inlineSpan: span,
            ...range,
          });
          inlineOrdinal += 1;
        },
      });
    }
    section.blocks.forEach((block, blockIndex) =>
      visit(block, [sectionIndex, blockIndex], section.id, blockIndex),
    );
  });
  return createResumeMarkdownProjection(document, map, baseDocumentVersion);
}

function degradationDiagnostic(
  sourceMap: ResumeMarkdownSourceMap,
): ResumeMarkdownDiagnostic {
  return {
    severity: "error",
    code: "projection_degraded",
    parameters: {},
    line: sourceMap.document.start.line,
    column: sourceMap.document.start.column,
  };
}

export function applyResumeMarkdownProjection({
  baseDocument,
  parsedDocument,
  sourceMap,
  projection: projectionInput,
  baseDocumentVersion,
}: {
  baseDocument: ResumeDocument;
  parsedDocument: ResumeDocument;
  sourceMap: ResumeMarkdownSourceMap;
  projection?: unknown;
  baseDocumentVersion: number;
}): ResumeMarkdownProjectionApplyResult {
  const projection = decodeResumeMarkdownProjection(projectionInput);
  if (!projection || projection.baseDocumentVersion !== baseDocumentVersion) {
    return {
      document: baseDocument,
      projection:
        projection ??
        createRebasedProjection(baseDocument, sourceMap, baseDocumentVersion),
      diagnostics: [
        {
          ...degradationDiagnostic(sourceMap),
          severity: "error",
          code: "projection_invalid",
        },
      ],
    };
  }

  const sectionMatches = matchSiblings({
    baseItems: baseDocument.sections,
    parsedItems: parsedDocument.sections,
    semanticKey: sectionSemanticKey,
    compatible: () => true,
  });
  let degraded = sectionMatches.degraded;
  const attributes = new Map(
    [...sourceMap.sections, ...sourceMap.blocks].map((entry) => [
      entry.id,
      new Set(entry.explicitAttributes ?? []),
    ]),
  );
  const sections = parsedDocument.sections.map((parsedSection, index) => {
    const baseIndex = sectionMatches.baseIndexes[index];
    if (baseIndex === undefined) return parsedSection;
    const baseSection = baseDocument.sections[baseIndex]!;
    const blocks = reconcileBlocks({
      baseBlocks: baseSection.blocks,
      parsedBlocks: parsedSection.blocks,
      projection,
      flattenGroups: !attributes.get(parsedSection.id)?.has("layout"),
      attributes,
    });
    degraded ||= blocks.degraded;
    const restoredTitle = parsedSection.title
      ? restoreResumeMarkdownInlinePresentation(
          baseSection.title ?? parsedSection.title,
          parsedSection.title,
        )
      : undefined;
    degraded ||= restoredTitle?.degraded ?? false;
    return {
      ...baseSection,
      ...parsedSection,
      id: baseSection.id,
      visible: attributes.get(parsedSection.id)?.has("visible")
        ? parsedSection.visible
        : baseSection.visible,
      title: restoredTitle?.content,
      titleStyle: parsedSection.titleStyle
        ? { ...baseSection.titleStyle, ...parsedSection.titleStyle }
        : baseSection.titleStyle,
      layout: parsedSection.layout
        ? { ...baseSection.layout, ...parsedSection.layout }
        : baseSection.layout,
      pagination: parsedSection.pagination
        ? { ...baseSection.pagination, ...parsedSection.pagination }
        : baseSection.pagination,
      blocks: blocks.blocks,
    };
  });
  const document = normalizeResumeDocumentStructure({
    ...baseDocument,
    ...parsedDocument,
    meta: {
      ...baseDocument.meta,
      ...parsedDocument.meta,
      import: parsedDocument.meta.import ?? baseDocument.meta.import,
    },
    sections,
  });
  return {
    document: degraded ? baseDocument : document,
    projection: degraded
      ? projection
      : createRebasedProjection(document, sourceMap, baseDocumentVersion),
    diagnostics: degraded ? [degradationDiagnostic(sourceMap)] : [],
  };
}
