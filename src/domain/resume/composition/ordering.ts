import {
  findBlockByPath,
  updateBlockChildrenAtPath,
} from "@/domain/resume/block-tree";
import type { ResumeDocument } from "@/domain/resume/schema";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import { resolveBlockRange } from "./operations";

/** Destination is the final start index of the whole selected range. */
export function moveSelectedBlocks(
  document: ResumeDocument,
  selection: ResumeEditorSelection,
  toIndex: number,
) {
  const unchanged = { document, selection };
  const range = resolveBlockRange(document, selection);
  if (
    !range ||
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex > range.siblings.length - range.blocks.length ||
    toIndex === range.start
  )
    return unchanged;
  const parent = findBlockByPath(range.section.blocks, range.parentPath);
  if (parent?.type === "row" && parent.columnLayout) return unchanged;
  const remaining = range.siblings.filter(
    (block) => !range.blocks.includes(block),
  );
  remaining.splice(toIndex, 0, ...range.blocks);
  const blocks = updateBlockChildrenAtPath(
    range.section.blocks,
    range.parentPath,
    () => remaining,
  );
  return {
    document: {
      ...document,
      sections: document.sections.map((section) =>
        section === range.section ? { ...section, blocks } : section,
      ),
    },
    selection,
  };
}
