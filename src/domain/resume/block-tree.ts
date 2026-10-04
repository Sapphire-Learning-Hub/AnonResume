import type {
  GroupBlock,
  ListBlock,
  ResumeBlock,
  ResumeDocument,
  ResumeListItem,
  RowBlock,
} from "./schema";
import { isRichTextContentEmpty } from "./rich-text";

export function isContainerBlock(
  block: ResumeBlock,
): block is GroupBlock | RowBlock {
  return block.type === "group" || block.type === "row";
}

function normalizeNestedBlock(
  block: ResumeBlock,
  removeEmptyText: boolean,
): ResumeBlock | undefined {
  if (block.type === "text") {
    return removeEmptyText && isRichTextContentEmpty(block.content)
      ? undefined
      : block;
  }

  if (block.type === "badges") {
    return block;
  }

  if (block.type === "list") {
    let changed = false;
    const items = block.items.flatMap((item) => {
      const children = item.children.flatMap((child) => {
        const normalized = normalizeNestedBlock(child, true);

        if (!normalized) {
          changed = true;
          return [];
        }

        if (normalized !== child) {
          changed = true;
        }

        return [normalized];
      });

      if (children.length === 0) {
        changed = true;
        return [];
      }

      return children.length === item.children.length &&
        children.every((child, index) => child === item.children[index])
        ? [item]
        : [{ ...item, children }];
    });

    if (items.length === 0) {
      return undefined;
    }

    return changed ? { ...block, items } : block;
  }

  let changed = false;
  const children = block.children.flatMap((child) => {
    const normalized = normalizeNestedBlock(child, true);

    if (!normalized) {
      changed = true;
      return [];
    }

    if (normalized !== child) {
      changed = true;
    }

    return [normalized];
  });

  if (children.length === 0) {
    return undefined;
  }

  return changed ? { ...block, children } : block;
}

export function normalizeResumeDocumentStructure(
  document: ResumeDocument,
): ResumeDocument {
  let documentChanged = false;
  const sections = document.sections.map((section) => {
    let sectionChanged = false;
    const blocks = section.blocks.flatMap((block) => {
      const normalized = normalizeNestedBlock(block, false);

      if (!normalized) {
        sectionChanged = true;
        return [];
      }

      if (normalized !== block) {
        sectionChanged = true;
      }

      return [normalized];
    });

    if (!sectionChanged) {
      return section;
    }

    documentChanged = true;
    return { ...section, blocks };
  });

  return documentChanged ? { ...document, sections } : document;
}

export function createFreshResumeNodeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function moveTreeItem<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);

  if (!movedItem) {
    return items;
  }

  nextItems.splice(toIndex, 0, movedItem);

  return nextItems;
}

export function updateListItemChildren(
  block: ListBlock,
  blockPath: string[],
  updater: (children: ResumeBlock[], nestedPath: string[]) => ResumeBlock[],
): ListBlock {
  const [itemId, ...rest] = blockPath;

  if (!itemId || rest.length === 0) {
    return block;
  }

  let changed = false;
  const nextItems = block.items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    const nextChildren = updater(item.children, rest);

    if (nextChildren === item.children) {
      return item;
    }

    changed = true;

    return {
      ...item,
      children: nextChildren,
    };
  });

  return changed ? { ...block, items: nextItems } : block;
}

export function cloneBlockWithFreshIds(block: ResumeBlock): ResumeBlock {
  switch (block.type) {
    case "text":
      return {
        ...block,
        id: createFreshResumeNodeId("text"),
        content: structuredClone(block.content),
        style: block.style ? { ...block.style } : undefined,
      };
    case "badges":
      return {
        ...block,
        id: createFreshResumeNodeId("badges"),
        items: block.items.map((item) => ({
          ...item,
          id: createFreshResumeNodeId("badge"),
        })),
      };
    case "list":
      return {
        ...block,
        id: createFreshResumeNodeId("list"),
        items: block.items.map(cloneListItemWithFreshIds),
      };
    case "group":
    case "row":
      return {
        ...block,
        id: createFreshResumeNodeId(block.type),
        children: block.children.map(cloneBlockWithFreshIds),
      };
  }
}

export function cloneListItemWithFreshIds(
  item: ResumeListItem,
): ResumeListItem {
  return {
    id: createFreshResumeNodeId("item"),
    children: item.children.map(cloneBlockWithFreshIds),
  };
}

function findListItemBlock(
  block: ListBlock,
  blockPath: string[],
): ResumeBlock | undefined {
  const [itemId, ...rest] = blockPath;

  if (!itemId || rest.length === 0) {
    return undefined;
  }

  const item = block.items.find((candidate) => candidate.id === itemId);

  return item ? findBlockByPath(item.children, rest) : undefined;
}

export function findBlockByPath(
  blocks: ResumeBlock[],
  blockPath: string[],
): ResumeBlock | undefined {
  const [currentId, ...rest] = blockPath;

  if (!currentId) return undefined;

  const currentBlock = blocks.find((block) => block.id === currentId);

  if (!currentBlock) return undefined;
  if (rest.length === 0) return currentBlock;
  if (isContainerBlock(currentBlock)) {
    return findBlockByPath(currentBlock.children, rest);
  }
  if (currentBlock.type === "list") {
    return findListItemBlock(currentBlock, rest);
  }

  return undefined;
}

function getListItemSiblingPosition(
  block: ListBlock,
  blockPath: string[],
): { index: number; count: number } | undefined {
  const [itemId, ...rest] = blockPath;

  if (!itemId || rest.length === 0) {
    return undefined;
  }

  const item = block.items.find((candidate) => candidate.id === itemId);

  return item
    ? getBlockSiblingPositionInBlocks(item.children, rest)
    : undefined;
}

function getBlockSiblingPositionInBlocks(
  blocks: ResumeBlock[],
  blockPath: string[],
): { index: number; count: number } | undefined {
  const [currentId, ...rest] = blockPath;

  if (!currentId) return undefined;

  const currentIndex = blocks.findIndex((block) => block.id === currentId);

  if (currentIndex === -1) return undefined;
  if (rest.length === 0) {
    return { index: currentIndex, count: blocks.length };
  }

  const currentBlock = blocks[currentIndex];

  if (currentBlock && isContainerBlock(currentBlock)) {
    return getBlockSiblingPositionInBlocks(currentBlock.children, rest);
  }
  if (currentBlock?.type === "list") {
    return getListItemSiblingPosition(currentBlock, rest);
  }

  return undefined;
}

export function getBlockSiblingPosition(
  blocks: ResumeBlock[],
  blockPath: string[],
) {
  return getBlockSiblingPositionInBlocks(blocks, blockPath);
}

export function findInnermostListItemAtPath(
  blocks: ResumeBlock[],
  blockPath: string[],
): { item: ResumeListItem; listPath: string[] } | undefined {
  let currentBlocks = blocks;
  let remainingPath = blockPath;
  let traversedPath: string[] = [];
  let target: { item: ResumeListItem; listPath: string[] } | undefined;

  while (remainingPath.length > 0) {
    const [currentId, ...rest] = remainingPath;
    const currentBlock = currentBlocks.find((block) => block.id === currentId);

    if (!currentBlock) break;

    if (isContainerBlock(currentBlock)) {
      currentBlocks = currentBlock.children;
      traversedPath = [...traversedPath, currentBlock.id];
      remainingPath = rest;
      continue;
    }

    if (currentBlock.type !== "list") break;

    const [itemId, ...itemRest] = rest;
    const item = currentBlock.items.find((candidate) => candidate.id === itemId);

    if (!item) break;

    target = {
      item,
      listPath: [...traversedPath, currentBlock.id],
    };
    currentBlocks = item.children;
    traversedPath = [...traversedPath, currentBlock.id, item.id];
    remainingPath = itemRest;
  }

  return target;
}
