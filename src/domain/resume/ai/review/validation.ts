import { reviewResultSchema, type ReviewGoal, type ValidatedReviewReport } from "./schema";
import type { ReviewContext } from "./context";
import { calculateReviewScore } from "./scoring";

function normalize(value: string) { return value.replace(/\s+/g, " ").trim(); }

export function validateReviewResult(value: unknown, context: ReviewContext, input: ReviewGoal): ValidatedReviewReport {
  const result = reviewResultSchema.parse(value);
  const targets = new Map(context.targets.map((target) => [target.id, normalize(target.text)]));
  for (const entry of [...result.issues, ...(result.match?.requirements ?? [])]) {
    for (const evidence of entry.evidence) {
      if (!targets.get(evidence.targetId)?.includes(normalize(evidence.quote))) throw new Error("invalid_review_evidence");
    }
  }
  for (const issue of result.issues) {
    if (issue.kind === "existing" && !issue.evidence.length) throw new Error("missing_review_evidence");
  }
  if (Boolean(input.targetRole?.trim() || input.jobDescription?.trim()) !== Boolean(result.match)) throw new Error("invalid_review_mode");
  let matchScore: number | null = null;
  if (result.match) {
    const explicit = result.match.requirements.filter((entry) => entry.source === "description");
    const citations = new Set<string>();
    for (const entry of result.match.requirements) {
      if (entry.status !== "not_demonstrated" && !entry.evidence.length) throw new Error("missing_match_evidence");
      if (entry.source === "description") {
        const quote = normalize(entry.text);
        if (!input.jobDescription?.trim() || !normalize(input.jobDescription).includes(quote) || citations.has(quote)) throw new Error("invalid_job_requirement");
        citations.add(quote);
      }
    }
    if (explicit.length >= 3) {
      const weighted = explicit.map((entry) => ({ weight: entry.importance === "required" ? 2 : 1, value: entry.status === "matched" ? 1 : entry.status === "partial" ? 0.5 : 0 }));
      matchScore = Math.round(100 * weighted.reduce((sum, entry) => sum + entry.weight * entry.value, 0) / weighted.reduce((sum, entry) => sum + entry.weight, 0));
    }
  }
  return {
    ...result, schemaVersion: 1, rubricVersion: 1, score: calculateReviewScore(result.dimensions),
    issues: result.issues.map((issue, index) => ({ ...issue, id: `issue-${index + 1}` })),
    match: result.match ? { ...result.match, score: matchScore } : null,
  };
}
