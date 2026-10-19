import { z } from "zod";

export const reviewDimensions = ["completeness", "clarity", "impact", "organization", "consistency"] as const;
export const reviewInputSchema = z.object({
  modelId: z.string().uuid(),
  resumeVersion: z.number().int().positive(),
  locale: z.enum(["zh-CN", "en-US"]),
  targetRole: z.string().trim().max(200).optional(),
  jobDescription: z.string().trim().max(16_000).optional(),
}).strict();
export type AiReviewInput = z.infer<typeof reviewInputSchema>;
export type ReviewGoal = Pick<AiReviewInput, "targetRole" | "jobDescription">;

const text = z.string().trim().min(1).max(2_000);
export const reviewEvidenceSchema = z.object({ targetId: z.string().min(1).max(300), quote: text }).strict();
export const reviewGradeSchema = z.object({
  dimension: z.enum(reviewDimensions), grade: z.number().int().min(0).max(4), reason: text,
}).strict();
export type ReviewGrade = z.infer<typeof reviewGradeSchema>;
export const reviewIssueSchema = z.object({
  dimension: z.enum(reviewDimensions),
  severity: z.enum(["important", "suggestion", "minor"]),
  kind: z.enum(["existing", "missing"]),
  title: z.string().trim().min(1).max(200), explanation: text, suggestion: text,
  evidence: z.array(reviewEvidenceSchema).max(5),
}).strict();
export const reviewRequirementSchema = z.object({
  text,
  source: z.enum(["description", "inferred"]),
  importance: z.enum(["required", "preferred"]),
  status: z.enum(["matched", "partial", "not_demonstrated"]),
  evidence: z.array(reviewEvidenceSchema).max(5), reason: text,
}).strict();
export const reviewResultSchema = z.object({
  summary: text,
  dimensions: z.array(reviewGradeSchema).length(5),
  strengths: z.array(text).max(10),
  issues: z.array(reviewIssueSchema).max(40),
  match: z.object({ summary: text, requirements: z.array(reviewRequirementSchema).max(20) }).strict().nullable(),
}).strict();
export type ReviewResult = z.infer<typeof reviewResultSchema>;
export type ValidatedReviewReport = Omit<ReviewResult, "issues" | "match"> & {
  schemaVersion: 1; rubricVersion: 1; score: number;
  issues: Array<ReviewResult["issues"][number] & { id: string }>;
  match: (NonNullable<ReviewResult["match"]> & { score: number | null }) | null;
};
