import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { buildReviewContext, isReviewStale } from "@/domain/resume/ai/review/context";
import { reviewDimensions } from "@/domain/resume/ai/review/schema";
import { calculateReviewScore } from "@/domain/resume/ai/review/scoring";
import { validateReviewResult } from "@/domain/resume/ai/review/validation";

function fixture() {
  const document = createDefaultResumeDocument("zh-CN");
  const context = buildReviewContext(document);
  const target = context.targets.find((item) => item.text.trim());
  if (!target) throw new Error("fixture_missing_target");
  return { document, context, target };
}

function output() {
  return {
    summary: "Content review",
    dimensions: reviewDimensions.map((dimension) => ({ dimension, grade: 4, reason: "Clear content" })),
    strengths: ["Clear structure"],
    issues: [],
    match: null,
  };
}

describe("resume quality review", () => {
  it("calculates fixed weighted scores and rejects invalid grades", () => {
    const dimensions = output().dimensions;
    expect(calculateReviewScore(dimensions)).toBe(100);
    expect(calculateReviewScore(dimensions.map((item) => ({ ...item, grade: 0 })))).toBe(0);
    expect(calculateReviewScore(dimensions.map((item) => ({ ...item, grade: item.dimension === "clarity" ? 0 : 4 })))).toBe(75);
    expect(() => calculateReviewScore(dimensions.slice(1))).toThrow();
    expect(() => calculateReviewScore([...dimensions, dimensions[0]!])).toThrow();
    expect(() => calculateReviewScore(dimensions.map((item) => ({ ...item, grade: 5 })))).toThrow();
  });

  it("ignores presentation changes but tracks content and ordering", () => {
    const { document, context } = fixture();
    const styled = structuredClone(document);
    styled.settings.theme.accent = "#123456";
    expect(isReviewStale(context.contentHash, styled)).toBe(false);
    styled.sections[0]!.title = createRichTextFromPlainText("Changed title");
    expect(isReviewStale(context.contentHash, styled)).toBe(true);
  });

  it("validates evidence against the exact target and assigns stable issue IDs", () => {
    const { context, target } = fixture();
    const issue = { dimension: "clarity", severity: "suggestion", title: "Clarify", explanation: "Explain the result", suggestion: "Be specific", kind: "existing", evidence: [{ targetId: target.id, quote: target.text.slice(0, 4) }] };
    const report = validateReviewResult({ ...output(), issues: [issue] }, context, {});
    expect(report.score).toBe(100);
    expect(report.issues[0]?.id).toBe("issue-1");
    expect(() => validateReviewResult({ ...output(), issues: [{ ...issue, evidence: [{ targetId: "missing", quote: "unknown" }] }] }, context, {})).toThrow();
    expect(() => validateReviewResult({ ...output(), issues: [{ ...issue, evidence: [{ targetId: target.id, quote: "NOT IN THE RESUME" }] }] }, context, {})).toThrow();
  });

  it("allows missing-content guidance without inventing evidence", () => {
    const { context } = fixture();
    const issue = { dimension: "completeness", severity: "suggestion", kind: "missing", title: "Explain scope", explanation: "Scope not described", suggestion: "Add the actual scope", evidence: [] };
    expect(validateReviewResult({ ...output(), issues: [issue] }, context, {}).issues).toHaveLength(1);
    expect(() => validateReviewResult({ ...output(), issues: [{ ...issue, kind: "existing" }] }, context, {})).toThrow();
  });

  it("never scores inferred requirements from a role title", () => {
    const { context } = fixture();
    const match = { summary: "Related experience", requirements: [{ text: "Communication", source: "inferred", importance: "preferred", status: "not_demonstrated", evidence: [], reason: "Not described" }] };
    const report = validateReviewResult({ ...output(), match }, context, { targetRole: "Engineer" });
    expect(report.match?.score).toBeNull();
    expect(() => validateReviewResult({ ...output(), match }, context, {})).toThrow();
  });

  it("checks JD requirement citations before calculating match coverage", () => {
    const { context, target } = fixture();
    const requirements = ["TypeScript", "PostgreSQL", "React"].map((text) => ({ text, source: "description", importance: "required", status: "matched", evidence: [{ targetId: target.id, quote: target.text.slice(0, 4) }], reason: "Relevant experience" }));
    const match = { summary: "Matching", requirements };
    const report = validateReviewResult({ ...output(), match }, context, { jobDescription: "TypeScript PostgreSQL React" });
    expect(report.match?.score).toBe(100);
    expect(() => validateReviewResult({ ...output(), match }, context, { jobDescription: "Unrelated requirement" })).toThrow();
  });
});
