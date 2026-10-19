import { reviewDimensions, reviewGradeSchema, type ReviewGrade } from "./schema";

const weights = { completeness: 20, clarity: 25, impact: 25, organization: 20, consistency: 10 } as const;

export function calculateReviewScore(grades: ReviewGrade[]) {
  const parsed = grades.map((grade) => reviewGradeSchema.parse(grade));
  if (parsed.length !== reviewDimensions.length || new Set(parsed.map((grade) => grade.dimension)).size !== reviewDimensions.length) {
    throw new Error("invalid_review_dimensions");
  }
  return Math.round(parsed.reduce((score, grade) => score + weights[grade.dimension] * grade.grade / 4, 0));
}
