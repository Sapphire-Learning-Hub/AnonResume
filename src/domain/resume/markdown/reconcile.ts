import type {
  BadgeBlock,
  ResumeBlock,
  ResumeDocument,
  ResumeListItem,
  ResumeSection,
} from "../schema";
import type { ResumeMarkdownSourceMap } from "./types";

function blockFingerprint(block: ResumeBlock): string {
  switch (block.type) {
    case "text":
      return `text:${JSON.stringify(block.content)}`;
    case "badges":
      return `badges:${block.items.map((item) => item.text).join("\u0000")}`;
    case "list":
      return `list:${block.ordered ?? false}:${block.items
        .map(itemFingerprint)
        .join("\u0001")}`;
    case "group":
    case "row":
      return `${block.type}:${block.children.map(blockFingerprint).join("\u0001")}`;
  }
}

function itemFingerprint(item: ResumeListItem) {
  return item.children.map(blockFingerprint).join("\u0001");
}

function sectionFingerprint(section: ResumeSection) {
  return `${JSON.stringify(section.title ?? null)}:${section.semantic ?? ""}`;
}

function matchSiblings<T extends { id: string }>(
  baseItems: T[],
  parsedItems: T[],
  fingerprint: (item: T) => string,
) {
  const buckets = new Map<string, number[]>();
  const baseById = new Map<string, number>();
  baseItems.forEach((item, index) => {
    const key = fingerprint(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
    baseById.set(item.id, index);
  });
  const used = new Set<number>();

  return parsedItems.map((item) => {
    const bucket = buckets.get(fingerprint(item));
    let matchedIndex = bucket?.find((index) => !used.has(index));
    if (matchedIndex === undefined) {
      const positionIndex = baseById.get(item.id);
      if (positionIndex !== undefined && !used.has(positionIndex)) {
        matchedIndex = positionIndex;
      }
    }
    if (matchedIndex !== undefined) used.add(matchedIndex);
    return matchedIndex === undefined ? undefined : baseItems[matchedIndex];
  });
}

function reconcileBadges(base: BadgeBlock, parsed: BadgeBlock) {
  const buckets = new Map<string, BadgeBlock["items"]>();
  for (const item of base.items) {
    const bucket = buckets.get(item.text);
    if (bucket) bucket.push(item);
    else buckets.set(item.text, [item]);
  }
  return parsed.items.map((item) => {
    const matched = buckets.get(item.text)?.shift();
    return matched ? { ...item, id: matched.id } : item;
  });
}

function reconcileItems(baseItems: ResumeListItem[], parsedItems: ResumeListItem[]) {
  const matches = matchSiblings(baseItems, parsedItems, itemFingerprint);
  return parsedItems.map((item, index) => {
    const base = matches[index];
    if (!base) return item;
    return {
      ...base,
      ...item,
      id: base.id,
      children: reconcileBlocks(base.children, item.children),
    };
  });
}

function reconcileBlock(base: ResumeBlock, parsed: ResumeBlock): ResumeBlock {
  if (base.type !== parsed.type) return parsed;
  switch (parsed.type) {
    case "text":
      return {
        ...base,
        ...parsed,
        id: base.id,
        style: parsed.style ?? (base.type === "text" ? base.style : undefined),
      };
    case "badges":
      return {
        ...base,
        ...parsed,
        id: base.id,
        items: reconcileBadges(base as BadgeBlock, parsed),
      };
    case "list":
      return {
        ...base,
        ...parsed,
        id: base.id,
        items: reconcileItems(
          (base as Extract<ResumeBlock, { type: "list" }>).items,
          parsed.items,
        ),
      };
    case "group":
    case "row":
      return {
        ...base,
        ...parsed,
        id: base.id,
        children: reconcileBlocks(
          (base as Extract<ResumeBlock, { type: "group" | "row" }>).children,
          parsed.children,
        ),
      } as ResumeBlock;
  }
}

function reconcileBlocks(baseBlocks: ResumeBlock[], parsedBlocks: ResumeBlock[]) {
  const matches = matchSiblings(baseBlocks, parsedBlocks, blockFingerprint);
  return parsedBlocks.map((block, index) => {
    const base = matches[index];
    return base ? reconcileBlock(base, block) : block;
  });
}

function reconcileSection(base: ResumeSection, parsed: ResumeSection): ResumeSection {
  return {
    ...base,
    ...parsed,
    id: base.id,
    titleStyle: parsed.titleStyle ?? base.titleStyle,
    layout: parsed.layout ?? base.layout,
    pagination: parsed.pagination ?? base.pagination,
    blocks: reconcileBlocks(base.blocks, parsed.blocks),
  };
}

export function reconcileResumeMarkdown(
  baseDocument: ResumeDocument,
  parsedDocument: ResumeDocument,
  sourceMap: ResumeMarkdownSourceMap,
): ResumeDocument {
  void sourceMap;
  const matches = matchSiblings(
    baseDocument.sections,
    parsedDocument.sections,
    sectionFingerprint,
  );
  return {
    ...baseDocument,
    ...parsedDocument,
    meta: {
      ...baseDocument.meta,
      ...parsedDocument.meta,
      import: parsedDocument.meta.import ?? baseDocument.meta.import,
    },
    sections: parsedDocument.sections.map((section, index) => {
      const base = matches[index];
      return base ? reconcileSection(base, section) : section;
    }),
  };
}
