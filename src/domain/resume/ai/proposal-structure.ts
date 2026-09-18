import { z } from "zod";

import {
  richTextContentSchema,
  type ResumeBlock,
} from "@/domain/resume/schema";

const proposedTextBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("text"),
    content: richTextContentSchema,
  })
  .strict();

const proposedBadgeBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("badges"),
    wrap: z.boolean(),
    gap: z.number().nonnegative().optional(),
    items: z
      .array(
        z
          .object({
            id: z.string().min(1),
            text: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const aiProposedBlockSchema: z.ZodType<ResumeBlock> = z.lazy(() =>
  z.discriminatedUnion("type", [
    proposedTextBlockSchema,
    proposedBadgeBlockSchema,
    z
      .object({
        id: z.string().min(1),
        type: z.literal("list"),
        ordered: z.boolean().optional(),
        marker: z.enum(["disc", "square", "dash", "none"]).optional(),
        gap: z.number().nonnegative().optional(),
        items: z
          .array(
            z
              .object({
                id: z.string().min(1),
                children: z.array(aiProposedBlockSchema).min(1),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    z
      .object({
        id: z.string().min(1),
        type: z.literal("group"),
        direction: z.enum(["vertical", "horizontal"]),
        gap: z.number().nonnegative().optional(),
        align: z.enum(["start", "center", "end", "stretch"]).optional(),
        children: z.array(aiProposedBlockSchema).min(1),
      })
      .strict(),
    z
      .object({
        id: z.string().min(1),
        type: z.literal("row"),
        gap: z.number().nonnegative().optional(),
        align: z.enum(["start", "center", "end"]).optional(),
        justify: z.enum(["start", "between", "end"]).optional(),
        children: z.array(aiProposedBlockSchema).min(1),
      })
      .strict(),
  ]),
);

export type AiProposedBlock = ResumeBlock;

export const aiProposedSectionSchema = z
  .object({
    id: z.string().min(1),
    title: richTextContentSchema.optional(),
    semantic: z.string().min(1).optional(),
    visible: z.boolean(),
    blocks: z.array(aiProposedBlockSchema).min(1),
  })
  .strict();

export type AiProposedSection = z.infer<typeof aiProposedSectionSchema>;
