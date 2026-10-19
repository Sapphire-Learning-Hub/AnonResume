import { reviewActionSchema } from "./actions";
import type { ReviewContext } from "./context";
import { reviewDimensions, type ReviewGoal, type ReviewGrade, type ReviewResult, type ValidatedReviewReport } from "./schema";
import { validateReviewResult } from "./validation";

export type ReviewWorkspaceState = {
  readOffsets: Record<string, number>;
  dimensions: ReviewGrade[];
  issues: ReviewResult["issues"];
  requirements: NonNullable<ReviewResult["match"]>["requirements"];
  matchReviewed: boolean;
};
export type ReviewActionResult =
  | { ok: false; error: "invalid_action" | "invalid_evidence" | "invalid_cursor" | "incomplete_review" | "invalid_mode" | "result_limit" }
  | { ok: true; content?: Array<{ targetId: string; offset: number; text: string }>; report?: ValidatedReviewReport };

function unique<T>(values: T[]): T[] {
  const entries = new Map<string, T>();
  for (const value of values) entries.set(JSON.stringify(value, (_key, field: unknown) => typeof field === "string" ? field.replace(/\s+/g, " ").trim() : field), value);
  return [...entries.values()];
}
function readOffset(offsets: Record<string, number>, id: string) {
  return Object.hasOwn(offsets, id) ? offsets[id] ?? 0 : 0;
}

export function createReviewWorkspace(context: ReviewContext, goal: ReviewGoal) {
  let state: ReviewWorkspaceState = { readOffsets: {}, dimensions: [], issues: [], requirements: [], matchReviewed: false };
  let finished: ValidatedReviewReport | undefined;
  const job = Boolean(goal.targetRole?.trim() || goal.jobDescription?.trim());
  const unread = () => context.targets.filter((target) => target.text.trim() && readOffset(state.readOffsets, target.id) < target.text.length);
  function summary() {
    return { unreadTargets: unread().length, nextUnread: unread().slice(0, 5).map((target) => ({ targetId: target.id, offset: readOffset(state.readOffsets, target.id) })), dimensions: state.dimensions, missingDimensions: reviewDimensions.filter((dimension) => !state.dimensions.some((entry) => entry.dimension === dimension)), issues: state.issues.map(({ title, dimension }) => ({ title, dimension })), requirements: state.requirements.map(({ text, source, status }) => ({ text, source, status })), matchReviewed: state.matchReviewed };
  }
  function validate(next: ReviewWorkspaceState, summaryText = "validation", strengths: string[] = [], matchSummary = "validation") {
    return validateReviewResult({ summary: summaryText, strengths,
      dimensions: reviewDimensions.map((dimension) => next.dimensions.find((entry) => entry.dimension === dimension) ?? { dimension, grade: 0, reason: "validation" }),
      issues: next.issues, match: job ? { summary: matchSummary, requirements: next.requirements } : null,
    }, context, goal);
  }
  function execute(value: unknown): ReviewActionResult {
    const parsed = reviewActionSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: "invalid_action" };
    const action = parsed.data;
    if (finished) return action.action === "finish_review" ? { ok: true, report: finished } : { ok: false, error: "invalid_action" };
    if (action.action === "read_review_content") {
      const targetId = action.arguments.targetId ?? unread()[0]?.id;
      if (!targetId) return { ok: true, content: [] };
      const index = context.targets.findIndex((target) => target.id === targetId);
      if (index < 0) return { ok: false, error: "invalid_cursor" };
      const offset = action.arguments.offset ?? readOffset(state.readOffsets, targetId);
      if (offset > readOffset(state.readOffsets, targetId)) return { ok: false, error: "invalid_cursor" };
      if (offset > 0 && /[\uDC00-\uDFFF]/.test(context.targets[index]!.text[offset] ?? "")) return { ok: false, error: "invalid_cursor" };
      const readOffsets = { ...state.readOffsets };
      const content: Array<{ targetId: string; offset: number; text: string }> = [];
      let remaining = 12000;
      for (let i = index; i < context.targets.length && remaining > 0; i++) {
        const target = context.targets[i]!;
        const start = i === index ? offset : readOffset(readOffsets, target.id);
        let end = Math.min(target.text.length, start + remaining);
        if (end < target.text.length && /[\uD800-\uDBFF]/.test(target.text[end - 1] ?? "")) end -= 1;
        const text = target.text.slice(start, end);
        if (text) content.push({ targetId: target.id, offset: start, text });
        Object.defineProperty(readOffsets, target.id, { value: Math.max(readOffset(readOffsets, target.id), end), writable: true, configurable: true, enumerable: true });
        remaining -= text.length;
        if (end < target.text.length) break;
      }
      state = { ...state, readOffsets };
      return { ok: true, content };
    }
    const next = structuredClone(state);
    if (action.action === "submit_review_dimension") next.dimensions = [...next.dimensions.filter((entry) => entry.dimension !== action.arguments.dimension), action.arguments];
    if (action.action === "submit_review_issues") next.issues = unique([...next.issues, ...action.arguments.issues]);
    if (action.action === "submit_review_match") {
      if (!job) return { ok: false, error: "invalid_mode" };
      next.requirements = unique([...next.requirements, ...action.arguments.requirements]);
      next.matchReviewed = true;
    }
    if (next.issues.length > 40 || next.requirements.length > 20) return { ok: false, error: "result_limit" };
    try {
      if (action.action === "finish_review") {
        if (unread().length || (job && !next.matchReviewed) || reviewDimensions.some((dimension) => !next.dimensions.some((entry) => entry.dimension === dimension))) return { ok: false, error: "incomplete_review" };
        if (job !== Boolean(action.arguments.matchSummary)) return { ok: false, error: "invalid_mode" };
        finished = validate(next, action.arguments.summary, action.arguments.strengths, action.arguments.matchSummary ?? "validation");
        return { ok: true, report: finished };
      }
      validate(next);
      state = next;
      return { ok: true };
    } catch { return { ok: false, error: "invalid_evidence" }; }
  }
  return { execute, summary, snapshot: () => structuredClone(state) };
}
