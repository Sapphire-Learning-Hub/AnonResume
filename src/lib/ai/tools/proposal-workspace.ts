import { z } from "zod";

import { findBlockByPath } from "@/domain/resume/block-tree";
import { hashAiContent } from "@/domain/resume/ai/content-hash";
import { applySelectedAiChanges } from "@/domain/resume/ai/proposal-apply";
import {
  aiResumeProposalSchema,
  type AiResumeChange,
  type AiResumeProposalInput,
} from "@/domain/resume/ai/proposal-schema";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import type { ResumeBlock, ResumeDocument } from "@/domain/resume/schema";

const reasonSchema = z.string().trim().min(1).max(500);
const pathSchema = z.array(z.string().min(1).max(200)).min(1).max(20);

type BlockDraft =
  | { type: "text"; text: string }
  | { type: "badges"; items: string[] }
  | { type: "list"; items: string[] }
  | {
      type: "group";
      direction?: "vertical" | "horizontal";
      children: BlockDraft[];
    }
  | { type: "row"; children: BlockDraft[] };

const blockDraftSchema: z.ZodType<BlockDraft> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string().trim().min(1) }).strict(),
    z
      .object({
        type: z.literal("badges"),
        items: z.array(z.string().trim().min(1)).min(1).max(30),
      })
      .strict(),
    z
      .object({
        type: z.literal("list"),
        items: z.array(z.string().trim().min(1)).min(1).max(30),
      })
      .strict(),
    z
      .object({
        type: z.literal("group"),
        direction: z.enum(["vertical", "horizontal"]).optional(),
        children: z.array(blockDraftSchema).min(1).max(20),
      })
      .strict(),
    z
      .object({
        type: z.literal("row"),
        children: z.array(blockDraftSchema).min(2).max(6),
      })
      .strict(),
  ]),
);

const sectionOperationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create"),
      title: z.string().trim().min(1).max(200),
      semantic: z.string().trim().min(1).max(100).optional(),
      afterSectionId: z.string().min(1).max(200).optional(),
      blocks: z.array(blockDraftSchema).min(1).max(30),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("rename"),
      sectionId: z.string().min(1).max(200),
      title: z.string().trim().min(1).max(200),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("move"),
      sectionId: z.string().min(1).max(200),
      toIndex: z.number().int().nonnegative(),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("delete"),
      sectionId: z.string().min(1).max(200),
      reason: reasonSchema,
    })
    .strict(),
]);

const blockOperationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("insert"),
      sectionId: z.string().min(1).max(200),
      afterBlockPath: pathSchema.optional(),
      block: blockDraftSchema,
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("move"),
      sectionId: z.string().min(1).max(200),
      blockPath: pathSchema,
      toIndex: z.number().int().nonnegative(),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("delete"),
      sectionId: z.string().min(1).max(200),
      blockPath: pathSchema,
      reason: reasonSchema,
    })
    .strict(),
]);

const contentOperationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("replace_section_title"),
      sectionId: z.string().min(1).max(200),
      text: z.string().trim().min(1),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("replace_text"),
      sectionId: z.string().min(1).max(200),
      blockPath: pathSchema,
      text: z.string().trim().min(1),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      type: z.enum(["replace_list_item", "delete_list_item"]),
      sectionId: z.string().min(1).max(200),
      listPath: pathSchema,
      itemId: z.string().min(1).max(200),
      text: z.string().trim().min(1).optional(),
      reason: reasonSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("insert_list_item"),
      sectionId: z.string().min(1).max(200),
      listPath: pathSchema,
      afterItemId: z.string().min(1).max(200),
      text: z.string().trim().min(1),
      reason: reasonSchema,
    })
    .strict(),
]);

export type AiProposalWorkspaceResult =
  | {
      ok: true;
      stagedChanges: number;
      proposal?: AiResumeProposalInput;
    }
  | {
      ok: false;
      error: "invalid_arguments" | "target_missing" | "proposal_empty" | "invalid_structure";
    };

function sectionFor(document: ResumeDocument, sectionId: string) {
  return document.sections.find((section) => section.id === sectionId);
}

function listFor(document: ResumeDocument, sectionId: string, listPath: string[]) {
  const section = sectionFor(document, sectionId);
  const block = section ? findBlockByPath(section.blocks, listPath) : undefined;
  return block?.type === "list" ? block : undefined;
}

export function createAiProposalWorkspace(input: {
  document: ResumeDocument;
  createId?: (prefix: string) => string;
}) {
  const createId = input.createId ?? ((prefix: string) => `${prefix}-${crypto.randomUUID()}`);
  const stagedChanges: AiResumeChange[] = [];

  function materializeBlock(draft: BlockDraft): ResumeBlock {
    switch (draft.type) {
      case "text":
        return {
          id: createId("ai-text"),
          type: "text",
          content: createRichTextFromPlainText(draft.text),
        };
      case "badges":
        return {
          id: createId("ai-badges"),
          type: "badges",
          wrap: true,
          gap: 8,
          items: draft.items.map((text) => ({
            id: createId("ai-badge"),
            text,
          })),
        };
      case "list":
        return {
          id: createId("ai-list"),
          type: "list",
          marker: "disc",
          gap: 6,
          items: draft.items.map((text) => ({
            id: createId("ai-item"),
            children: [materializeBlock({ type: "text", text })],
          })),
        };
      case "group":
        return {
          id: createId("ai-group"),
          type: "group",
          direction: draft.direction ?? "vertical",
          gap: 8,
          children: draft.children.map(materializeBlock),
        };
      case "row":
        return {
          id: createId("ai-row"),
          type: "row",
          gap: 16,
          align: "start",
          justify: "between",
          children: draft.children.map(materializeBlock),
        };
    }
  }

  function stageSections(argumentsValue: unknown): AiProposalWorkspaceResult {
    const parsed = z
      .object({ operations: z.array(sectionOperationSchema).min(1).max(20) })
      .strict()
      .safeParse(argumentsValue);
    if (!parsed.success) return { ok: false, error: "invalid_arguments" };

    const changes: AiResumeChange[] = [];
    for (const operation of parsed.data.operations) {
      if (operation.type === "create") {
        if (
          operation.afterSectionId &&
          !sectionFor(input.document, operation.afterSectionId)
        ) {
          return { ok: false, error: "target_missing" };
        }
        changes.push({
          id: createId("ai-change"),
          type: "create_section",
          beforeHash: hashAiContent(input.document.sections),
          afterSectionId: operation.afterSectionId,
          section: {
            id: createId("ai-section"),
            title: createRichTextFromPlainText(operation.title),
            semantic: operation.semantic,
            visible: true,
            blocks: operation.blocks.map(materializeBlock),
          },
          reason: operation.reason,
        });
        continue;
      }

      const section = sectionFor(input.document, operation.sectionId);
      if (!section) return { ok: false, error: "target_missing" };
      const id = createId("ai-change");
      if (operation.type === "rename") {
        changes.push({
          id,
          type: "replace_section_title",
          sectionId: operation.sectionId,
          beforeHash: hashAiContent(section.title ?? null),
          content: createRichTextFromPlainText(operation.title),
          reason: operation.reason,
        });
      } else if (operation.type === "move") {
        changes.push({
          id,
          type: "move_section",
          sectionId: operation.sectionId,
          toIndex: operation.toIndex,
          beforeHash: hashAiContent(input.document.sections),
          reason: operation.reason,
        });
      } else {
        changes.push({
          id,
          type: "delete_section",
          sectionId: operation.sectionId,
          beforeHash: hashAiContent(section),
          reason: operation.reason,
        });
      }
    }
    stagedChanges.push(...changes);
    return { ok: true, stagedChanges: stagedChanges.length };
  }

  function stageBlocks(argumentsValue: unknown): AiProposalWorkspaceResult {
    const parsed = z
      .object({ operations: z.array(blockOperationSchema).min(1).max(30) })
      .strict()
      .safeParse(argumentsValue);
    if (!parsed.success) return { ok: false, error: "invalid_arguments" };

    const changes: AiResumeChange[] = [];
    for (const operation of parsed.data.operations) {
      const section = sectionFor(input.document, operation.sectionId);
      if (!section) return { ok: false, error: "target_missing" };
      const id = createId("ai-change");
      if (operation.type === "insert") {
        if (
          operation.afterBlockPath &&
          !findBlockByPath(section.blocks, operation.afterBlockPath)
        ) {
          return { ok: false, error: "target_missing" };
        }
        changes.push({
          id,
          type: "insert_block",
          sectionId: operation.sectionId,
          afterBlockPath: operation.afterBlockPath,
          block: materializeBlock(operation.block),
          beforeHash: hashAiContent(section.blocks),
          reason: operation.reason,
        });
        continue;
      }
      const block = findBlockByPath(section.blocks, operation.blockPath);
      if (!block) return { ok: false, error: "target_missing" };
      changes.push(
        operation.type === "move"
          ? {
              id,
              type: "move_block",
              sectionId: operation.sectionId,
              blockPath: operation.blockPath,
              toIndex: operation.toIndex,
              beforeHash: hashAiContent(section.blocks),
              reason: operation.reason,
            }
          : {
              id,
              type: "delete_block",
              sectionId: operation.sectionId,
              blockPath: operation.blockPath,
              beforeHash: hashAiContent(block),
              reason: operation.reason,
            },
      );
    }
    stagedChanges.push(...changes);
    return { ok: true, stagedChanges: stagedChanges.length };
  }

  function stageContent(argumentsValue: unknown): AiProposalWorkspaceResult {
    const parsed = z
      .object({ operations: z.array(contentOperationSchema).min(1).max(50) })
      .strict()
      .safeParse(argumentsValue);
    if (!parsed.success) return { ok: false, error: "invalid_arguments" };

    const changes: AiResumeChange[] = [];
    for (const operation of parsed.data.operations) {
      const section = sectionFor(input.document, operation.sectionId);
      if (!section) return { ok: false, error: "target_missing" };
      const id = createId("ai-change");
      if (operation.type === "replace_section_title") {
        changes.push({
          id,
          type: operation.type,
          sectionId: operation.sectionId,
          beforeHash: hashAiContent(section.title ?? null),
          content: createRichTextFromPlainText(operation.text),
          reason: operation.reason,
        });
        continue;
      }
      if (operation.type === "replace_text") {
        const block = findBlockByPath(section.blocks, operation.blockPath);
        if (!block || block.type !== "text") {
          return { ok: false, error: "target_missing" };
        }
        changes.push({
          id,
          type: operation.type,
          sectionId: operation.sectionId,
          blockPath: operation.blockPath,
          beforeHash: hashAiContent(block.content),
          content: createRichTextFromPlainText(operation.text),
          reason: operation.reason,
        });
        continue;
      }
      const list = listFor(input.document, operation.sectionId, operation.listPath);
      if (!list) return { ok: false, error: "target_missing" };
      if (operation.type === "insert_list_item") {
        if (!list.items.some((item) => item.id === operation.afterItemId)) {
          return { ok: false, error: "target_missing" };
        }
        changes.push({
          id,
          type: operation.type,
          sectionId: operation.sectionId,
          listPath: operation.listPath,
          afterItemId: operation.afterItemId,
          beforeHash: hashAiContent(list.items),
          content: createRichTextFromPlainText(operation.text),
          reason: operation.reason,
        });
        continue;
      }
      const item = list.items.find((candidate) => candidate.id === operation.itemId);
      if (!item) return { ok: false, error: "target_missing" };
      if (operation.type === "replace_list_item" && !operation.text) {
        return { ok: false, error: "invalid_arguments" };
      }
      changes.push(
        operation.type === "replace_list_item"
          ? {
              id,
              type: operation.type,
              sectionId: operation.sectionId,
              listPath: operation.listPath,
              itemId: operation.itemId,
              beforeHash: hashAiContent(item),
              content: createRichTextFromPlainText(operation.text!),
              reason: operation.reason,
            }
          : {
              id,
              type: operation.type,
              sectionId: operation.sectionId,
              listPath: operation.listPath,
              itemId: operation.itemId,
              beforeHash: hashAiContent(item),
              reason: operation.reason,
            },
      );
    }
    stagedChanges.push(...changes);
    return { ok: true, stagedChanges: stagedChanges.length };
  }

  function submit(argumentsValue: unknown): AiProposalWorkspaceResult {
    const parsed = z
      .object({ summary: z.string().trim().min(1).max(1_000) })
      .strict()
      .safeParse(argumentsValue);
    if (!parsed.success) return { ok: false, error: "invalid_arguments" };
    if (stagedChanges.length === 0) return { ok: false, error: "proposal_empty" };
    const proposal = aiResumeProposalSchema.parse({
      summary: parsed.data.summary,
      changes: stagedChanges,
    });
    const dryRun = applySelectedAiChanges({
      document: input.document,
      currentVersion: 1,
      baseResumeVersion: 1,
      proposal,
      selectedChangeIds: proposal.changes.map((change) => change.id),
    });
    if (!dryRun.ok) return { ok: false, error: "invalid_structure" };
    return { ok: true, stagedChanges: stagedChanges.length, proposal };
  }

  return {
    execute(name: string, argumentsValue: unknown): AiProposalWorkspaceResult {
      switch (name) {
        case "stage_section_changes":
          return stageSections(argumentsValue);
        case "stage_block_changes":
          return stageBlocks(argumentsValue);
        case "stage_content_changes":
          return stageContent(argumentsValue);
        case "submit_resume_proposal":
          return submit(argumentsValue);
        default:
          return { ok: false, error: "invalid_arguments" };
      }
    },
  };
}
