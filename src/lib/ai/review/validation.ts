import { z } from "zod";
import { reviewInputSchema, reviewIssueSchema, reviewResultSchema } from "@/domain/resume/ai/review/schema";
import { aiRunProgressStages } from "@/lib/ai/runs/stream-events";

export const storedReportSchema = reviewResultSchema.extend({
  schemaVersion: z.literal(1), rubricVersion: z.literal(1), score: z.number().min(0).max(100),
  issues: z.array(reviewIssueSchema.extend({ id: z.string() })),
  match: reviewResultSchema.shape.match.unwrap().extend({ score: z.number().min(0).max(100).nullable() }).nullable(),
});
export const reviewStatusSchema = z.enum(["queued", "preparing", "streaming", "complete", "failed", "stopped", "interrupted", "settlement_pending"]);
export const reviewDetailsSchema = z.object({
  id: z.string().uuid(), runId: z.string().uuid(), input: reviewInputSchema, modelName: z.string(),
  report: storedReportSchema.nullable(), ignoredIssueIds: z.array(z.string()), createdAt: z.string(),
  status: reviewStatusSchema, progress: z.array(z.enum(aiRunProgressStages)), failureCode: z.string().nullable(), finalPoints: z.number().nullable(), stale: z.boolean(),
  targets: z.array(z.object({ id: z.string(), sectionId: z.string(), blockPath: z.array(z.string()) })),
});
export const reviewCursorSchema = z.object({ id: z.string().uuid(), createdAt: z.iso.datetime() });
export const reviewPageSchema = z.object({
  items: z.array(reviewDetailsSchema.pick({ id: true, runId: true, input: true, modelName: true, createdAt: true, status: true }).extend({ score: z.number().nullable() })),
  nextCursor: reviewCursorSchema.nullable(),
});
export type ReviewDetails = z.infer<typeof reviewDetailsSchema>;
export type ReviewPage = z.infer<typeof reviewPageSchema>;
