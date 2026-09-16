import { findBlockByPath } from "@/domain/resume/block-tree";
import {
  insertListItemAfterDocument,
  removeListItemFromDocument,
  setSectionTitleInDocument,
  updateTextBlockContentInDocument,
} from "@/domain/resume/operations";
import type {
  ListBlock,
  ResumeDocument,
  ResumeListItem,
  TextBlock,
} from "@/domain/resume/schema";

import { hashAiContent } from "./content-hash";
import type { AiResumeChange, AiResumeProposalInput } from "./proposal-schema";

export type AiResumeProposal = AiResumeProposalInput;

export type AiProposalConflictReason =
  | "resume_version_changed"
  | "target_missing"
  | "target_type_changed"
  | "target_content_changed"
  | "duplicate_target";

export interface AiProposalConflict {
  changeId: string;
  reason: AiProposalConflictReason;
}

function sectionFor(document: ResumeDocument, sectionId: string) {
  return document.sections.find((section) => section.id === sectionId);
}

function listFor(
  document: ResumeDocument,
  sectionId: string,
  listPath: string[],
) {
  const section = sectionFor(document, sectionId);
  const block = section ? findBlockByPath(section.blocks, listPath) : undefined;
  return block?.type === "list" ? block : undefined;
}

function listItemFor(list: ListBlock, itemId: string) {
  return list.items.find((item) => item.id === itemId);
}

function primaryTextBlock(item: ResumeListItem) {
  return item.children.find((block): block is TextBlock => block.type === "text");
}

function targetKey(change: AiResumeChange) {
  switch (change.type) {
    case "replace_section_title":
      return `section:${change.sectionId}:title`;
    case "replace_text":
      return `block:${change.sectionId}:${change.blockPath.join("/")}`;
    case "replace_list_item":
    case "delete_list_item":
      return `item:${change.sectionId}:${change.listPath.join("/")}:${change.itemId}`;
    case "insert_list_item":
      return `insert:${change.sectionId}:${change.listPath.join("/")}:${change.afterItemId}`;
  }
}

function validateChange(
  document: ResumeDocument,
  change: AiResumeChange,
): AiProposalConflictReason | null {
  const section = sectionFor(document, change.sectionId);
  if (!section) return "target_missing";

  switch (change.type) {
    case "replace_section_title":
      return hashAiContent(section.title ?? null) === change.beforeHash
        ? null
        : "target_content_changed";
    case "replace_text": {
      const block = findBlockByPath(section.blocks, change.blockPath);
      if (!block) return "target_missing";
      if (block.type !== "text") return "target_type_changed";
      return hashAiContent(block.content) === change.beforeHash
        ? null
        : "target_content_changed";
    }
    case "replace_list_item":
    case "delete_list_item": {
      const list = listFor(document, change.sectionId, change.listPath);
      if (!list) return "target_type_changed";
      const item = listItemFor(list, change.itemId);
      if (!item) return "target_missing";
      if (change.type === "replace_list_item" && !primaryTextBlock(item)) {
        return "target_type_changed";
      }
      return hashAiContent(item) === change.beforeHash
        ? null
        : "target_content_changed";
    }
    case "insert_list_item": {
      const list = listFor(document, change.sectionId, change.listPath);
      if (!list) return "target_type_changed";
      if (!listItemFor(list, change.afterItemId)) return "target_missing";
      return hashAiContent(list.items) === change.beforeHash
        ? null
        : "target_content_changed";
    }
  }
}

function applyChange(document: ResumeDocument, change: AiResumeChange) {
  switch (change.type) {
    case "replace_section_title":
      return setSectionTitleInDocument({
        document,
        sectionId: change.sectionId,
        title: change.content,
      });
    case "replace_text":
      return updateTextBlockContentInDocument({
        document,
        sectionId: change.sectionId,
        blockPath: change.blockPath,
        content: change.content,
      });
    case "replace_list_item": {
      const list = listFor(document, change.sectionId, change.listPath)!;
      const item = listItemFor(list, change.itemId)!;
      const textBlock = primaryTextBlock(item)!;
      return updateTextBlockContentInDocument({
        document,
        sectionId: change.sectionId,
        blockPath: [...change.listPath, change.itemId, textBlock.id],
        content: change.content,
      });
    }
    case "insert_list_item":
      return insertListItemAfterDocument({
        document,
        sectionId: change.sectionId,
        listPath: change.listPath,
        itemId: change.afterItemId,
        item: {
          id: `ai-item-${change.id}`,
          children: [
            {
              id: `ai-item-${change.id}-text`,
              type: "text",
              content: change.content,
            },
          ],
        },
      });
    case "delete_list_item":
      return removeListItemFromDocument({
        document,
        sectionId: change.sectionId,
        listPath: change.listPath,
        itemId: change.itemId,
      });
  }
}

export function applySelectedAiChanges({
  document,
  currentVersion,
  baseResumeVersion,
  proposal,
  selectedChangeIds,
}: {
  document: ResumeDocument;
  currentVersion: number;
  baseResumeVersion: number;
  proposal: AiResumeProposal;
  selectedChangeIds: string[];
}):
  | { ok: true; document: ResumeDocument }
  | { ok: false; conflicts: AiProposalConflict[] } {
  const selected = new Set(selectedChangeIds);
  const changes = proposal.changes.filter((change) => selected.has(change.id));

  if (currentVersion !== baseResumeVersion) {
    return {
      ok: false,
      conflicts: changes.map((change) => ({
        changeId: change.id,
        reason: "resume_version_changed",
      })),
    };
  }

  const seenTargets = new Set<string>();
  const conflicts = changes.flatMap((change) => {
    const key = targetKey(change);
    if (seenTargets.has(key)) {
      return [{ changeId: change.id, reason: "duplicate_target" as const }];
    }
    seenTargets.add(key);
    const reason = validateChange(document, change);
    return reason ? [{ changeId: change.id, reason }] : [];
  });
  if (conflicts.length > 0) return { ok: false, conflicts };

  return {
    ok: true,
    document: changes.reduce(applyChange, document),
  };
}
