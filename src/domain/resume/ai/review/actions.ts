import { z } from "zod";
import { reviewEvidenceSchema, reviewGradeSchema, reviewIssueSchema, reviewRequirementSchema } from "./schema";

const evidence = z.array(reviewEvidenceSchema.extend({ quote: z.string().trim().min(1).max(300) })).max(3);
const boundedText = z.string().trim().min(1).max(400);
export const reviewActionArguments = {
  read_review_content: z.object({ targetId: z.string().max(300).optional(), offset: z.number().int().nonnegative().optional() }).strict(),
  submit_review_dimension: reviewGradeSchema.extend({ reason: z.string().trim().min(1).max(800) }),
  submit_review_issues: z.object({ issues: z.array(reviewIssueSchema.extend({ title: z.string().trim().min(1).max(120), explanation: boundedText, suggestion: boundedText, evidence })).min(1).max(3) }).strict(),
  submit_review_match: z.object({ requirements: z.array(reviewRequirementSchema.extend({ text: boundedText, reason: boundedText, evidence })).max(3) }).strict(),
  finish_review: z.object({ summary: z.string().trim().min(1).max(1200), strengths: z.array(z.string().trim().min(1).max(200)).max(6), matchSummary: z.string().trim().min(1).max(1200).nullable() }).strict(),
};
export const reviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read_review_content"), arguments: reviewActionArguments.read_review_content }).strict(),
  z.object({ action: z.literal("submit_review_dimension"), arguments: reviewActionArguments.submit_review_dimension }).strict(),
  z.object({ action: z.literal("submit_review_issues"), arguments: reviewActionArguments.submit_review_issues }).strict(),
  z.object({ action: z.literal("submit_review_match"), arguments: reviewActionArguments.submit_review_match }).strict(),
  z.object({ action: z.literal("finish_review"), arguments: reviewActionArguments.finish_review }).strict(),
]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;
