import type { ResumeBlock } from "./schema";

export interface ResumeEditorSelection {
  sectionId?: string;
  blockPath?: string[];
  badgeItemId?: string;
  richTextField?: string;
}

export function createSelectionForBlock(
  sectionId: string,
  block: ResumeBlock,
  parentPath: string[] = [],
): ResumeEditorSelection {
  const blockPath = [...parentPath, block.id];

  switch (block.type) {
    case "text":
      return {
        sectionId,
        blockPath,
        richTextField: "content",
      };
    case "badges":
      return {
        sectionId,
        blockPath,
        badgeItemId: block.items[0]?.id,
      };
    case "list": {
      const firstItem = block.items[0];
      const firstChild = firstItem?.children[0];

      return firstItem && firstChild
        ? createSelectionForBlock(sectionId, firstChild, [
            ...blockPath,
            firstItem.id,
          ])
        : { sectionId, blockPath };
    }
    case "group":
    case "row": {
      const firstChild = block.children[0];

      return firstChild
        ? createSelectionForBlock(sectionId, firstChild, blockPath)
        : { sectionId, blockPath };
    }
  }
}
