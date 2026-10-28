import { createBlockFromPreset } from "@/domain/resume/block-presets";
import {
  findBlockByPath,
  getBlockChildrenAtPath,
  getBlockSubtreeDepth,
  isContainerBlock,
  normalizeResumeDocumentStructure,
  updateBlockChildrenAtPath,
} from "@/domain/resume/block-tree";
import type { ResumeEditorSelection } from "@/domain/resume/editor-selection";
import type { ResumeBlock, ResumeDocument } from "@/domain/resume/schema";
import { resumeValidationLimits } from "@/domain/resume/validation";

export type BlockCompositionCommand =
  | "group"
  | "row"
  | "image-right"
  | "ungroup"
  | "into-previous"
  | "into-next"
  | "out";

export function resolveBlockRange(
  document: ResumeDocument,
  selection: ResumeEditorSelection,
) {
  const section = document.sections.find(
    (section) => section.id === selection.sectionId,
  );
  const path = selection.blockPath;
  if (!section || !path?.length) return undefined;
  const parentPath = path.slice(0, -1);
  const siblings = getBlockChildrenAtPath(section.blocks, parentPath);
  const ids = selection.blockRange ?? [path.at(-1)!];
  if (!siblings || !ids.length || !ids.includes(path.at(-1)!)) return undefined;
  const start = siblings.findIndex((block) => block.id === ids[0]);
  if (start < 0 || ids.some((id, index) => siblings[start + index]?.id !== id))
    return undefined;
  return {
    section,
    parentPath,
    siblings,
    start,
    blocks: siblings.slice(start, start + ids.length),
  };
}

export function extendBlockSelection(
  document: ResumeDocument,
  current: ResumeEditorSelection,
  target: ResumeEditorSelection,
): ResumeEditorSelection {
  const first = resolveBlockRange(document, current);
  const last = resolveBlockRange(document, target);
  if (
    !first ||
    !last ||
    first.section.id !== last.section.id ||
    first.parentPath.length !== last.parentPath.length ||
    first.parentPath.some((id, index) => id !== last.parentPath[index])
  )
    return target;
  const anchor = first.siblings.findIndex(
    (block) => block.id === current.blockPath?.at(-1),
  );
  const end = last.start;
  return {
    sectionId: current.sectionId,
    blockPath: current.blockPath,
    blockRange: first.siblings
      .slice(Math.min(anchor, end), Math.max(anchor, end) + 1)
      .map((block) => block.id),
  };
}

function wrapper(type: "group" | "row", children: ResumeBlock[]): ResumeBlock {
  const block = createBlockFromPreset(type);
  if (!isContainerBlock(block)) throw new Error("invalid_container_preset");
  return { ...block, children };
}

export function canComposeResumeBlocks(
  document: ResumeDocument,
  selection: ResumeEditorSelection,
  command: BlockCompositionCommand,
): boolean {
  const range = resolveBlockRange(document, selection);
  if (!range) return false;
  const { blocks, siblings, start, parentPath, section } = range;
  const parent = findBlockByPath(section.blocks, parentPath);
  const parentDepth = parentPath.filter((_, index) =>
    findBlockByPath(section.blocks, parentPath.slice(0, index + 1)),
  ).length;
  const addsLevel =
    command === "group" ||
    command === "row" ||
    command === "image-right" ||
    command === "into-previous" ||
    command === "into-next";
  if (
    addsLevel &&
    blocks.some(
      (block) =>
        parentDepth +
          getBlockSubtreeDepth(block) +
          (command === "image-right" &&
          blocks.length > 2 &&
          block.type !== "image"
            ? 2
            : 1) >
        resumeValidationLimits.maxBlockTreeDepth,
    )
  )
    return false;
  // Fixed-column boundaries are explicit: unwrap the row before moving its columns.
  if (parent?.type === "row" && parent.columnLayout) return false;
  switch (command) {
    case "group":
    case "row":
      return blocks.length > 1;
    case "image-right":
      return (
        blocks.length > 1 &&
        blocks.filter((block) => block.type === "image").length === 1
      );
    case "ungroup":
      return blocks.length === 1 && isContainerBlock(blocks[0]!);
    case "into-previous":
    case "into-next": {
      const target =
        siblings[
          command === "into-previous" ? start - 1 : start + blocks.length
        ];
      return Boolean(
        target &&
        isContainerBlock(target) &&
        !(target.type === "row" && target.columnLayout),
      );
    }
    case "out": {
      const outerParent = findBlockByPath(
        section.blocks,
        parentPath.slice(0, -1),
      );
      return Boolean(
        parent &&
        isContainerBlock(parent) &&
        !(outerParent?.type === "row" && outerParent.columnLayout),
      );
    }
  }
}

export function composeResumeBlocks(
  document: ResumeDocument,
  selection: ResumeEditorSelection,
  command: BlockCompositionCommand,
): { document: ResumeDocument; selection: ResumeEditorSelection } {
  const range = resolveBlockRange(document, selection);
  if (!range || !canComposeResumeBlocks(document, selection, command))
    return { document, selection };
  const { section, parentPath, siblings, start, blocks } = range;
  let nextPath = parentPath;
  let selectedIds: string[];
  let nextBlocks: ResumeBlock[];
  if (command === "out") {
    const containerId = parentPath.at(-1)!;
    nextPath = parentPath.slice(0, -1);
    const outer = getBlockChildrenAtPath(section.blocks, nextPath)!;
    nextBlocks = outer.flatMap((block) => {
      if (block.id !== containerId || !isContainerBlock(block)) return [block];
      const children = siblings.filter((child) => !blocks.includes(child));
      return [...(children.length ? [{ ...block, children }] : []), ...blocks];
    });
    selectedIds = blocks.map((block) => block.id);
  } else {
    let replacement: ResumeBlock[];
    if (command === "into-previous" || command === "into-next") {
      const targetIndex =
        command === "into-previous" ? start - 1 : start + blocks.length;
      const target = siblings[targetIndex]!;
      if (!isContainerBlock(target)) return { document, selection };
      nextBlocks = siblings.flatMap((block) =>
        blocks.includes(block)
          ? []
          : block === target
            ? [
                {
                  ...target,
                  children:
                    command === "into-previous"
                      ? [...target.children, ...blocks]
                      : [...blocks, ...target.children],
                },
              ]
            : [block],
      );
      nextPath = [...parentPath, target.id];
      selectedIds = blocks.map((block) => block.id);
      const updated = updateBlockChildrenAtPath(
        section.blocks,
        parentPath,
        () => nextBlocks,
      );
      return {
        document: normalizeResumeDocumentStructure({
          ...document,
          sections: document.sections.map((candidate) =>
            candidate === section ? { ...section, blocks: updated } : candidate,
          ),
        }),
        selection: {
          sectionId: section.id,
          blockPath: [...nextPath, selectedIds[0]!],
          ...(selectedIds.length > 1 ? { blockRange: selectedIds } : {}),
        },
      };
    }
    if (command === "ungroup") {
      const container = blocks[0]!;
      if (!isContainerBlock(container)) return { document, selection };
      replacement = container.children;
    } else if (command === "image-right") {
      const image = blocks.find((block) => block.type === "image")!;
      const left = blocks.filter((block) => block !== image);
      const row = wrapper("row", [
        left.length === 1 ? left[0]! : wrapper("group", left),
        image,
      ]);
      if (row.type !== "row") throw new Error("invalid_row_preset");
      replacement = [{ ...row, columnLayout: "image-right" }];
    } else replacement = [wrapper(command, blocks)];
    nextBlocks = [
      ...siblings.slice(0, start),
      ...replacement,
      ...siblings.slice(start + blocks.length),
    ];
    selectedIds = replacement.map((block) => block.id);
  }
  const updated = updateBlockChildrenAtPath(
    section.blocks,
    command === "out" ? nextPath : parentPath,
    () => nextBlocks,
  );
  const nextDocument = normalizeResumeDocumentStructure({
    ...document,
    sections: document.sections.map((candidate) =>
      candidate === section ? { ...section, blocks: updated } : candidate,
    ),
  });
  return {
    document: nextDocument,
    selection: selectedIds.length
      ? {
          sectionId: section.id,
          blockPath: [...nextPath, selectedIds[0]!],
          ...(selectedIds.length > 1 ? { blockRange: selectedIds } : {}),
        }
      : { sectionId: section.id },
  };
}
