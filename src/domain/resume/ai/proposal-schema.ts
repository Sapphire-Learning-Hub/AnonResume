import { z } from "zod";

import { richTextContentSchema } from "@/domain/resume/schema";

import {
  aiProposedBlockSchema,
  aiProposedSectionSchema,
} from "./proposal-structure";

const changeBase = {
  id: z.string().min(1).max(100),
  beforeHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().min(1).max(500),
};

const sectionTarget = {
  sectionId: z.string().min(1).max(200),
};

const blockTarget = {
  ...sectionTarget,
  blockPath: z.array(z.string().min(1).max(200)).min(1).max(20),
};

const listTarget = {
  ...sectionTarget,
  listPath: z.array(z.string().min(1).max(200)).min(1).max(20),
};

export const aiResumeChangeSchema = z.discriminatedUnion("type", [
  z.object({
    ...changeBase,
    type: z.literal("create_section"),
    afterSectionId: z.string().min(1).max(200).optional(),
    section: aiProposedSectionSchema,
  }).strict(),
  z.object({
    ...changeBase,
    ...sectionTarget,
    type: z.literal("delete_section"),
  }).strict(),
  z.object({
    ...changeBase,
    ...sectionTarget,
    type: z.literal("move_section"),
    toIndex: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    ...changeBase,
    ...sectionTarget,
    type: z.literal("insert_block"),
    afterBlockPath: z.array(z.string().min(1).max(200)).min(1).max(20).optional(),
    block: aiProposedBlockSchema,
  }).strict(),
  z.object({
    ...changeBase,
    ...blockTarget,
    type: z.literal("delete_block"),
  }).strict(),
  z.object({
    ...changeBase,
    ...blockTarget,
    type: z.literal("move_block"),
    toIndex: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    ...changeBase,
    ...sectionTarget,
    type: z.literal("replace_section_title"),
    content: richTextContentSchema,
  }).strict(),
  z.object({
    ...changeBase,
    ...blockTarget,
    type: z.literal("replace_text"),
    content: richTextContentSchema,
  }).strict(),
  z.object({
    ...changeBase,
    ...listTarget,
    type: z.literal("replace_list_item"),
    itemId: z.string().min(1).max(200),
    content: richTextContentSchema,
  }).strict(),
  z.object({
    ...changeBase,
    ...listTarget,
    type: z.literal("insert_list_item"),
    afterItemId: z.string().min(1).max(200),
    content: richTextContentSchema,
  }).strict(),
  z.object({
    ...changeBase,
    ...listTarget,
    type: z.literal("delete_list_item"),
    itemId: z.string().min(1).max(200),
  }).strict(),
]);

export const aiResumeProposalSchema = z
  .object({
    summary: z.string().min(1).max(1_000).optional(),
    changes: z.array(aiResumeChangeSchema).min(1).max(50),
  })
  .strict()
  .superRefine((proposal, context) => {
    const ids = new Set<string>();
    for (const [index, change] of proposal.changes.entries()) {
      if (ids.has(change.id)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate change ID",
          path: ["changes", index, "id"],
        });
      }
      ids.add(change.id);
    }
  });

export type AiResumeChange = z.infer<typeof aiResumeChangeSchema>;
export type AiResumeProposalInput = z.infer<typeof aiResumeProposalSchema>;
