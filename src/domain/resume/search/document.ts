import {
  findBlockByPath,
  removeBlockTreeNode,
  updateBlockChildrenAtPath,
  visitResumeBlocks,
} from "@/domain/resume/block-tree";
import type { ResumeBlock, ResumeDocument } from "@/domain/resume/schema";
import { findTextMatches } from "./match";
import { findRichTextMatches, replaceRichTextMatches } from "./rich-text";
import type { ResumeSearchMatch, ResumeSearchQuery } from "./types";

function fieldKey(
  match: Pick<
    ResumeSearchMatch,
    "sectionId" | "blockPath" | "field" | "badgeItemId"
  >,
) {
  return JSON.stringify([
    match.sectionId,
    match.field,
    match.blockPath,
    match.badgeItemId,
  ]);
}

export function findResumeMatches(
  document: ResumeDocument,
  query: ResumeSearchQuery,
): ResumeSearchMatch[] {
  if (!query.text) return [];
  const result: ResumeSearchMatch[] = [];
  const append = (match: Omit<ResumeSearchMatch, "key">) => {
    result.push({
      ...match,
      key: JSON.stringify([
        fieldKey(match),
        match.paragraphIndex,
        match.from,
        match.to,
      ]),
    });
  };
  for (const section of document.sections) {
    if (!section.visible) continue;
    if (section.title) {
      for (const match of findRichTextMatches(section.title, query))
        append({
          ...match,
          sectionId: section.id,
          blockPath: [],
          field: "title",
        });
    }
    visitResumeBlocks(section.blocks, (block, blockPath) => {
      if (block.type === "text") {
        for (const match of findRichTextMatches(block.content, query))
          append({
            ...match,
            sectionId: section.id,
            blockPath,
            field: "content",
          });
      }
      if (block.type === "badges") {
        for (const item of block.items) {
          for (const match of findTextMatches(item.text, query))
            append({
              ...match,
              paragraphIndex: 0,
              sectionId: section.id,
              blockPath,
              field: "badge",
              badgeItemId: item.id,
            });
        }
      }
    });
  }
  return result;
}

export function replaceResumeMatches(
  document: ResumeDocument,
  query: ResumeSearchQuery,
  replacement: string,
  targetKey?: string,
): { document: ResumeDocument; count: number } {
  const selected = findResumeMatches(document, query).filter(
    (match) =>
      match.text !== replacement &&
      (targetKey === undefined || match.key === targetKey),
  );
  if (!selected.length) return { document, count: 0 };
  const groups = new Map<string, ResumeSearchMatch[]>();
  for (const match of selected) {
    const key = fieldKey(match);
    const group = groups.get(key) ?? [];
    group.push(match);
    groups.set(key, group);
  }
  const sections = document.sections.map((section) => {
    const fields = Array.from(groups.values()).filter(
      ([first]) => first?.sectionId === section.id,
    );
    if (!fields.length) return section;
    let title = section.title;
    let blocks = section.blocks;
    for (const matches of fields) {
      const match = matches[0]!;
      if (match.field === "title") {
        if (title)
          title = replaceRichTextMatches(
            title,
            query,
            replacement,
            targetKey === undefined ? undefined : match,
          ).content;
        continue;
      }
      const block = findBlockByPath(blocks, match.blockPath);
      let updated: ResumeBlock | undefined;
      if (block?.type === "text")
        updated = {
          ...block,
          content: replaceRichTextMatches(
            block.content,
            query,
            replacement,
            targetKey === undefined ? undefined : match,
          ).content,
        };
      if (block?.type === "badges") {
        const items = block.items.flatMap((item) => {
          if (item.id !== match.badgeItemId) return [item];
          let text = item.text;
          for (const range of [...matches].reverse())
            text =
              text.slice(0, range.from) + replacement + text.slice(range.to);
          return text ? [{ ...item, text }] : [];
        });
        if (!items.length) {
          blocks = removeBlockTreeNode(blocks, match.blockPath);
          continue;
        }
        updated = { ...block, items };
      }
      if (updated) {
        const nextBlock = updated;
        blocks = updateBlockChildrenAtPath(
          blocks,
          match.blockPath.slice(0, -1),
          (children) =>
            children.map((child) =>
              child.id === nextBlock.id ? nextBlock : child,
            ),
        );
      }
    }
    return { ...section, ...(title ? { title } : {}), blocks };
  });
  return { document: { ...document, sections }, count: selected.length };
}
