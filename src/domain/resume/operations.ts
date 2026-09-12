import { defaultLocale, resolveLocale, type AppLocale } from "@/i18n/messages";

import {
  cloneBlockWithFreshIds,
  createFreshResumeNodeId,
  findBlockByPath,
  getBlockSiblingPosition as getBlockSiblingPositionInBlocks,
  isContainerBlock,
  moveTreeItem,
  updateListItemChildren,
} from "./block-tree";
import type {
  BadgeBlock,
  GroupBlock,
  ListBlock,
  ResumeListItem,
  ResumeBlock,
  ResumeDocument,
  ResumeSection,
  RichTextContent,
  RowBlock,
  TextBlock,
} from "./schema";
import { createSectionFromPreset } from "./presets";
import { removeInlineTextColorMarks } from "./rich-text";

export {
  cloneBlockWithFreshIds,
  cloneListItemWithFreshIds,
  findBlockByPath,
  findInnermostListItemAtPath,
} from "./block-tree";

export function getPlainTextFromRichText(content: RichTextContent): string {
  return content.content
    .map((paragraph) =>
      paragraph.content
        .map((node) => {
          if (node.type === "hardBreak") return "\n";
          if (node.type === "resumeIcon") return "";
          return node.text;
        })
        .join(""),
    )
    .join("\n");
}

export function createRichTextFromPlainText(text: string): RichTextContent {
  const lines = text.split("\n");

  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text" as const, text: line }] : [],
    })),
  };
}

export function cloneSectionWithFreshIds(section: ResumeSection): ResumeSection {
  return {
    ...section,
    id: createFreshResumeNodeId("section"),
    title: section.title ? structuredClone(section.title) : undefined,
    titleStyle: section.titleStyle ? { ...section.titleStyle } : undefined,
    layout: section.layout ? structuredClone(section.layout) : undefined,
    pagination: section.pagination ? { ...section.pagination } : undefined,
    blocks: section.blocks.map(cloneBlockWithFreshIds),
  };
}

export function insertSectionAfterDocument({
  document,
  sectionId,
  section,
}: {
  document: ResumeDocument;
  sectionId: string;
  section: ResumeSection;
}): ResumeDocument {
  const sectionIndex = document.sections.findIndex((item) => item.id === sectionId);

  if (sectionIndex === -1) {
    return document;
  }

  return {
    ...document,
    sections: [
      ...document.sections.slice(0, sectionIndex + 1),
      section,
      ...document.sections.slice(sectionIndex + 1),
    ],
  };
}

function insertBlockAfterPathInBlocks(
  blocks: ResumeBlock[],
  blockPath: string[],
  blockToInsert: ResumeBlock,
): ResumeBlock[] {
  const [currentId, ...rest] = blockPath;

  if (!currentId) {
    return blocks;
  }

  if (rest.length === 0) {
    const sourceIndex = blocks.findIndex((block) => block.id === currentId);

    if (sourceIndex === -1) {
      return blocks;
    }

    return [
      ...blocks.slice(0, sourceIndex + 1),
      blockToInsert,
      ...blocks.slice(sourceIndex + 1),
    ];
  }

  return blocks.map((block) => {
    if (block.id !== currentId) {
      return block;
    }

    if (isContainerBlock(block)) {
      const nextChildren = insertBlockAfterPathInBlocks(
        block.children,
        rest,
        blockToInsert,
      );

      return nextChildren === block.children
        ? block
        : { ...block, children: nextChildren };
    }

    if (block.type === "list") {
      const nextItems = updateListItemChildren(
        block,
        rest,
        (children, nestedPath) =>
          insertBlockAfterPathInBlocks(children, nestedPath, blockToInsert),
      );

      return nextItems === block ? block : nextItems;
    }

    return block;
  });
}

export function insertBlockAfterDocument({
  document,
  sectionId,
  blockPath,
  block,
}: {
  document: ResumeDocument;
  sectionId: string;
  blockPath: string[];
  block: ResumeBlock;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      const nextBlocks = insertBlockAfterPathInBlocks(
        section.blocks,
        blockPath,
        block,
      );

      return nextBlocks === section.blocks
        ? section
        : { ...section, blocks: nextBlocks };
    }),
  };
}

export function appendBlockToSectionDocument({
  document,
  sectionId,
  block,
}: {
  document: ResumeDocument;
  sectionId: string;
  block: ResumeBlock;
}): ResumeDocument {
  const sectionIndex = document.sections.findIndex(
    (section) => section.id === sectionId,
  );

  if (sectionIndex === -1) {
    return document;
  }

  return {
    ...document,
    sections: document.sections.map((section, index) =>
      index === sectionIndex
        ? { ...section, blocks: [...section.blocks, block] }
        : section,
    ),
  };
}

function insertListItemAfterPathInBlocks(
  blocks: ResumeBlock[],
  listPath: string[],
  itemId: string,
  itemToInsert: ResumeListItem,
): ResumeBlock[] {
  const [currentId, ...rest] = listPath;

  if (!currentId) {
    return blocks;
  }

  return blocks.map((block) => {
    if (block.id !== currentId) {
      return block;
    }

    if (rest.length === 0) {
      if (block.type !== "list") {
        return block;
      }

      const sourceIndex = block.items.findIndex((item) => item.id === itemId);

      if (sourceIndex === -1) {
        return block;
      }

      return {
        ...block,
        items: [
          ...block.items.slice(0, sourceIndex + 1),
          itemToInsert,
          ...block.items.slice(sourceIndex + 1),
        ],
      };
    }

    if (isContainerBlock(block)) {
      const nextChildren = insertListItemAfterPathInBlocks(
        block.children,
        rest,
        itemId,
        itemToInsert,
      );

      return nextChildren === block.children
        ? block
        : { ...block, children: nextChildren };
    }

    if (block.type === "list") {
      const nextList = updateListItemChildren(
        block,
        rest,
        (children, nestedPath) =>
          insertListItemAfterPathInBlocks(
            children,
            nestedPath,
            itemId,
            itemToInsert,
          ),
      );

      return nextList;
    }

    return block;
  });
}

export function insertListItemAfterDocument({
  document,
  sectionId,
  listPath,
  itemId,
  item,
}: {
  document: ResumeDocument;
  sectionId: string;
  listPath: string[];
  itemId: string;
  item: ResumeListItem;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      const nextBlocks = insertListItemAfterPathInBlocks(
        section.blocks,
        listPath,
        itemId,
        item,
      );

      return nextBlocks === section.blocks
        ? section
        : { ...section, blocks: nextBlocks };
    }),
  };
}

function removeBlockAtPathInBlocks(
  blocks: ResumeBlock[],
  blockPath: string[],
): ResumeBlock[] {
  const [currentId, ...rest] = blockPath;

  if (!currentId) {
    return blocks;
  }

  if (rest.length === 0) {
    return blocks.filter((block) => block.id !== currentId);
  }

  return blocks.flatMap((block) => {
    if (block.id !== currentId) {
      return [block];
    }

    if (isContainerBlock(block)) {
      const nextChildren = removeBlockAtPathInBlocks(block.children, rest);

      if (nextChildren.length === 0) {
        return [];
      }

      return [
        nextChildren === block.children
          ? block
          : { ...block, children: nextChildren },
      ];
    }

    if (block.type === "list") {
      return [
        updateListItemChildren(
          block,
          rest,
          (children, nestedPath) => removeBlockAtPathInBlocks(children, nestedPath),
        ),
      ];
    }

    return [block];
  });
}

export function removeBlockFromDocument({
  document,
  sectionId,
  blockPath,
}: {
  document: ResumeDocument;
  sectionId: string;
  blockPath: string[];
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      const nextBlocks = removeBlockAtPathInBlocks(section.blocks, blockPath);

      return nextBlocks === section.blocks
        ? section
        : { ...section, blocks: nextBlocks };
    }),
  };
}

function removeListItemAtPathInBlocks(
  blocks: ResumeBlock[],
  listPath: string[],
  itemId: string,
): ResumeBlock[] {
  const [currentId, ...rest] = listPath;

  if (!currentId) {
    return blocks;
  }

  return blocks.flatMap((block) => {
    if (block.id !== currentId) {
      return [block];
    }

    if (rest.length === 0) {
      if (block.type !== "list") {
        return [block];
      }

      const nextItems = block.items.filter((item) => item.id !== itemId);

      if (nextItems.length === block.items.length) {
        return [block];
      }

      return nextItems.length > 0 ? [{ ...block, items: nextItems }] : [];
    }

    if (isContainerBlock(block)) {
      const nextChildren = removeListItemAtPathInBlocks(block.children, rest, itemId);

      if (nextChildren === block.children) {
        return [block];
      }

      return nextChildren.length > 0
        ? [{ ...block, children: nextChildren }]
        : [];
    }

    if (block.type === "list") {
      const nextList = updateListItemChildren(
        block,
        rest,
        (children, nestedPath) =>
          removeListItemAtPathInBlocks(children, nestedPath, itemId),
      );

      if (nextList === block) {
        return [block];
      }

      const nextItems = nextList.items.filter((item) => item.children.length > 0);

      return nextItems.length > 0
        ? [{ ...nextList, items: nextItems }]
        : [];
    }

    return [block];
  });
}

export function removeListItemFromDocument({
  document,
  sectionId,
  listPath,
  itemId,
}: {
  document: ResumeDocument;
  sectionId: string;
  listPath: string[];
  itemId: string;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      const nextBlocks = removeListItemAtPathInBlocks(
        section.blocks,
        listPath,
        itemId,
      );

      return nextBlocks === section.blocks
        ? section
        : { ...section, blocks: nextBlocks };
    }),
  };
}

export function createDefaultSection(
  locale: AppLocale = defaultLocale,
): ResumeSection {
  return createSectionFromPreset("custom", resolveLocale(locale));
}

export function findTextBlock(
  document: ResumeDocument,
  sectionId: string,
  blockPath: string[],
): TextBlock | undefined {
  const section = document.sections.find((item) => item.id === sectionId);

  if (!section) return undefined;

  const block = findBlockByPath(section.blocks, blockPath);

  return block?.type === "text" ? block : undefined;
}

export function getBlockSiblingPosition(
  document: ResumeDocument,
  sectionId: string,
  blockPath: string[],
) {
  const section = document.sections.find((item) => item.id === sectionId);

  if (!section) {
    return undefined;
  }

  return getBlockSiblingPositionInBlocks(section.blocks, blockPath);
}

function updateBlocksAtPath(
  blocks: ResumeBlock[],
  blockPath: string[],
  nextContent: RichTextContent,
): ResumeBlock[] {
  const [currentId, ...rest] = blockPath;

  return blocks.map((block) => {
    if (block.id !== currentId) return block;

    if (rest.length === 0 && block.type === "text") {
      return {
        ...block,
        content: nextContent,
      };
    }

    if (isContainerBlock(block)) {
      return {
        ...block,
        children: updateBlocksAtPath(block.children, rest, nextContent),
      };
    }

    if (block.type === "list") {
      return updateListItemChildren(
        block,
        rest,
        (children, nestedPath) => updateBlocksAtPath(children, nestedPath, nextContent),
      );
    }

    return block;
  });
}

function updateBlockStylesAtPath(
  blocks: ResumeBlock[],
  blockPath: string[],
  nextStyle: Partial<NonNullable<TextBlock["style"]>>,
): ResumeBlock[] {
  const [currentId, ...rest] = blockPath;

  return blocks.map((block) => {
    if (block.id !== currentId) return block;

    if (rest.length === 0 && block.type === "text") {
      return {
        ...block,
        style: {
          ...block.style,
          ...nextStyle,
        },
      };
    }

    if (isContainerBlock(block)) {
      return {
        ...block,
        children: updateBlockStylesAtPath(block.children, rest, nextStyle),
      };
    }

    if (block.type === "list") {
      return updateListItemChildren(
        block,
        rest,
        (children, nestedPath) => updateBlockStylesAtPath(children, nestedPath, nextStyle),
      );
    }

    return block;
  });
}

function updateBadgeItemsAtPath(
  blocks: ResumeBlock[],
  blockPath: string[],
  items: BadgeBlock["items"],
): ResumeBlock[] {
  const [currentId, ...rest] = blockPath;

  return blocks.map((block) => {
    if (block.id !== currentId) return block;

    if (rest.length === 0 && block.type === "badges") {
      return {
        ...block,
        items,
      };
    }

    if (isContainerBlock(block)) {
      return {
        ...block,
        children: updateBadgeItemsAtPath(block.children, rest, items),
      };
    }

    if (block.type === "list") {
      return updateListItemChildren(
        block,
        rest,
        (children, nestedPath) => updateBadgeItemsAtPath(children, nestedPath, items),
      );
    }

    return block;
  });
}

export type ResumeBlockSettings =
  | ({ type: "list" } & Pick<ListBlock, "ordered" | "marker" | "gap">)
  | ({ type: "badges" } & Pick<BadgeBlock, "wrap" | "gap">)
  | ({ type: "group" } & Pick<
      GroupBlock,
      "direction" | "align" | "gap"
    >)
  | ({ type: "row" } & Pick<RowBlock, "align" | "justify" | "gap">);

function updateBlockSettingsAtPath(
  blocks: ResumeBlock[],
  blockPath: string[],
  settings: ResumeBlockSettings,
): ResumeBlock[] {
  const [currentId, ...rest] = blockPath;

  return blocks.map((block) => {
    if (block.id !== currentId) return block;

    if (rest.length === 0) {
      switch (block.type) {
        case "list":
          return settings.type === "list" ? { ...block, ...settings } : block;
        case "badges":
          return settings.type === "badges" ? { ...block, ...settings } : block;
        case "group":
          return settings.type === "group" ? { ...block, ...settings } : block;
        case "row":
          return settings.type === "row" ? { ...block, ...settings } : block;
        case "text":
          return block;
      }
    }

    if (isContainerBlock(block)) {
      return {
        ...block,
        children: updateBlockSettingsAtPath(block.children, rest, settings),
      };
    }

    if (block.type === "list") {
      return updateListItemChildren(
        block,
        rest,
        (children, nestedPath) =>
          updateBlockSettingsAtPath(children, nestedPath, settings),
      );
    }

    return block;
  });
}

export function updateTextBlockContentInDocument({
  document,
  sectionId,
  blockPath,
  content,
}: {
  document: ResumeDocument;
  sectionId: string;
  blockPath: string[];
  content: RichTextContent;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) return section;

      return {
        ...section,
        blocks: updateBlocksAtPath(section.blocks, blockPath, content),
      };
    }),
  };
}

export function updateTextBlockStyleInDocument({
  document,
  sectionId,
  blockPath,
  style,
}: {
  document: ResumeDocument;
  sectionId: string;
  blockPath: string[];
  style: Partial<NonNullable<TextBlock["style"]>>;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) return section;

      return {
        ...section,
        blocks: updateBlockStylesAtPath(section.blocks, blockPath, style),
      };
    }),
  };
}

export function setTextBlockColorInDocument({
  document,
  sectionId,
  blockPath,
  color,
}: {
  document: ResumeDocument;
  sectionId: string;
  blockPath: string[];
  color: string;
}): ResumeDocument {
  const section = document.sections.find((item) => item.id === sectionId);
  const block = section ? findBlockByPath(section.blocks, blockPath) : undefined;

  if (!block || block.type !== "text") {
    return document;
  }

  return updateTextBlockStyleInDocument({
    document: updateTextBlockContentInDocument({
      document,
      sectionId,
      blockPath,
      content: removeInlineTextColorMarks(block.content),
    }),
    sectionId,
    blockPath,
    style: { color },
  });
}

export function updateBadgeItemsInDocument({
  document,
  sectionId,
  blockPath,
  items,
}: {
  document: ResumeDocument;
  sectionId: string;
  blockPath: string[];
  items: BadgeBlock["items"];
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) return section;

      return {
        ...section,
        blocks: updateBadgeItemsAtPath(section.blocks, blockPath, items),
      };
    }),
  };
}

export function updateBlockSettingsInDocument({
  document,
  sectionId,
  blockPath,
  settings,
}: {
  document: ResumeDocument;
  sectionId: string;
  blockPath: string[];
  settings: ResumeBlockSettings;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) return section;

      return {
        ...section,
        blocks: updateBlockSettingsAtPath(section.blocks, blockPath, settings),
      };
    }),
  };
}

export function updateSectionTitleInDocument({
  document,
  sectionId,
  content,
}: {
  document: ResumeDocument;
  sectionId: string;
  content: RichTextContent;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      return {
        ...section,
        title: content,
      };
    }),
  };
}

export function setSectionTitleInDocument({
  document,
  sectionId,
  title,
}: {
  document: ResumeDocument;
  sectionId: string;
  title?: RichTextContent;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) return section;

      return {
        ...section,
        title,
        titleStyle: title ? section.titleStyle : undefined,
      };
    }),
  };
}

export function setSectionTitleColorInDocument({
  document,
  sectionId,
  color,
}: {
  document: ResumeDocument;
  sectionId: string;
  color?: string;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      const titleStyle = {
        ...section.titleStyle,
        color,
      };

      return {
        ...section,
        titleStyle:
          titleStyle.color || titleStyle.fontSize ? titleStyle : undefined,
      };
    }),
  };
}

export function setSectionTitleFontSizeInDocument({
  document,
  sectionId,
  fontSize,
}: {
  document: ResumeDocument;
  sectionId: string;
  fontSize?: number;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      const titleStyle = {
        ...section.titleStyle,
        fontSize,
      };

      return {
        ...section,
        titleStyle:
          titleStyle.color || titleStyle.fontSize ? titleStyle : undefined,
      };
    }),
  };
}

export function updateSectionLayoutInDocument({
  document,
  sectionId,
  layout,
}: {
  document: ResumeDocument;
  sectionId: string;
  layout: Partial<NonNullable<ResumeSection["layout"]>>;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      return {
        ...section,
        layout: {
          ...section.layout,
          ...layout,
        },
      };
    }),
  };
}

export function updateSectionPaginationInDocument({
  document,
  sectionId,
  pagination,
}: {
  document: ResumeDocument;
  sectionId: string;
  pagination: Partial<NonNullable<ResumeSection["pagination"]>>;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) return section;

      return {
        ...section,
        pagination: {
          ...section.pagination,
          ...pagination,
        },
      };
    }),
  };
}

export function updateSectionSemanticInDocument({
  document,
  sectionId,
  semantic,
}: {
  document: ResumeDocument;
  sectionId: string;
  semantic?: string;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      return {
        ...section,
        semantic,
      };
    }),
  };
}

export function updateTextBlockInDocument({
  document,
  sectionId,
  blockPath,
  text,
}: {
  document: ResumeDocument;
  sectionId: string;
  blockPath: string[];
  text: string;
}): ResumeDocument {
  return updateTextBlockContentInDocument({
    document,
    sectionId,
    blockPath,
    content: createRichTextFromPlainText(text),
  });
}

export function appendSectionToDocument(
  document: ResumeDocument,
  section: ResumeSection,
): ResumeDocument {
  return {
    ...document,
    sections: [...document.sections, section],
  };
}

export function setSectionVisibilityInDocument({
  document,
  sectionId,
  visible,
}: {
  document: ResumeDocument;
  sectionId: string;
  visible: boolean;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) =>
      section.id === sectionId
        ? {
            ...section,
            visible,
          }
        : section,
    ),
  };
}

export function removeSectionFromDocument({
  document,
  sectionId,
}: {
  document: ResumeDocument;
  sectionId: string;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.filter((section) => section.id !== sectionId),
  };
}

export function moveSectionInDocument({
  document,
  sectionId,
  toIndex,
}: {
  document: ResumeDocument;
  sectionId: string;
  toIndex: number;
}): ResumeDocument {
  const fromIndex = document.sections.findIndex((section) => section.id === sectionId);

  if (fromIndex === -1) {
    return document;
  }

  const nextSections = moveTreeItem(document.sections, fromIndex, toIndex);

  if (nextSections === document.sections) {
    return document;
  }

  return {
    ...document,
    sections: nextSections,
  };
}

function moveBlocksAtPath(
  blocks: ResumeBlock[],
  blockPath: string[],
  toIndex: number,
): ResumeBlock[] {
  const [currentId, ...rest] = blockPath;

  if (!currentId) {
    return blocks;
  }

  if (rest.length === 0) {
    const fromIndex = blocks.findIndex((block) => block.id === currentId);

    return moveTreeItem(blocks, fromIndex, toIndex);
  }

  return blocks.map((block) => {
    if (block.id !== currentId) {
      return block;
    }

    if (isContainerBlock(block)) {
      const nextChildren = moveBlocksAtPath(block.children, rest, toIndex);

      if (nextChildren === block.children) {
        return block;
      }

      return {
        ...block,
        children: nextChildren,
      };
    }

    if (block.type === "list") {
      if (rest.length === 1) {
        const itemId = rest[0];
        const fromIndex = block.items.findIndex((item) => item.id === itemId);
        const nextItems = moveTreeItem(block.items, fromIndex, toIndex);

        return nextItems === block.items ? block : { ...block, items: nextItems };
      }

      return updateListItemChildren(
        block,
        rest,
        (children, nestedPath) => moveBlocksAtPath(children, nestedPath, toIndex),
      );
    }

    return block;
  });
}

export function moveBlockInDocument({
  document,
  sectionId,
  blockPath,
  toIndex,
}: {
  document: ResumeDocument;
  sectionId: string;
  blockPath: string[];
  toIndex: number;
}): ResumeDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      if (section.id !== sectionId) {
        return section;
      }

      const nextBlocks = moveBlocksAtPath(section.blocks, blockPath, toIndex);

      if (nextBlocks === section.blocks) {
        return section;
      }

      return {
        ...section,
        blocks: nextBlocks,
      };
    }),
  };
}
