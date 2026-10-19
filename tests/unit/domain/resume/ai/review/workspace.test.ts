import { createReviewWorkspace } from "@/domain/resume/ai/review/workspace";
import { reviewDimensions } from "@/domain/resume/ai/review/schema";
import type { ReviewContext } from "@/domain/resume/ai/review/context";

const context: ReviewContext = { contentHash: "frozen", targets: [{ id: "body", sectionId: "section", blockPath: ["body"], text: "Built a reliable export queue." }] };
const finish = { action: "finish_review", arguments: { summary: "Clear resume", strengths: ["Clear structure"], matchSummary: null } };
function grade(workspace: ReturnType<typeof createReviewWorkspace>) {
  for (const dimension of reviewDimensions) expect(workspace.execute({ action: "submit_review_dimension", arguments: { dimension, grade: 3, reason: "Clear enough" } }).ok).toBe(true);
}
const issue = { dimension: "clarity", severity: "minor", kind: "existing", title: "Explain scope", explanation: "Scope is unclear", suggestion: "Add actual scope", evidence: [{ targetId: "body", quote: "export queue" }] };

it("requires full source coverage and all five dimensions before assembling a scored report", () => {
  const workspace = createReviewWorkspace(context, {});
  grade(workspace);
  expect(workspace.execute(finish)).toMatchObject({ ok: false, error: "incomplete_review" });
  expect(workspace.execute({ action: "read_review_content", arguments: {} }).ok).toBe(true);
  expect(workspace.execute(finish)).toMatchObject({ ok: true, report: { score: 75, issues: [] } });
});

it("bounds Unicode reads and does not accept a skipped cursor as read coverage", () => {
  const text = "中".repeat(11999) + "😀末";
  const workspace = createReviewWorkspace({ ...context, targets: [{ ...context.targets[0]!, text }] }, {});
  expect(workspace.execute({ action: "read_review_content", arguments: { targetId: "body", offset: 12000 } }).ok).toBe(false);
  const first = workspace.execute({ action: "read_review_content", arguments: {} });
  expect(JSON.stringify(first).includes("\ufffd")).toBe(false);
  expect(workspace.summary().unreadTargets).toBe(1);
  const second = workspace.execute({ action: "read_review_content", arguments: {} });
  expect(second.ok).toBe(true);
  expect(workspace.summary().unreadTargets).toBe(0);
});

it("requires a job-match action in job mode even when no requirements can be identified", () => {
  const workspace = createReviewWorkspace(context, { targetRole: "Engineer" });
  workspace.execute({ action: "read_review_content", arguments: {} });
  grade(workspace);
  const jobFinish = { ...finish, arguments: { ...finish.arguments, matchSummary: "No explicit requirements supplied" } };
  expect(workspace.execute(jobFinish)).toMatchObject({ ok: false, error: "incomplete_review" });
  expect(workspace.execute({ action: "submit_review_match", arguments: { requirements: [] } }).ok).toBe(true);
  expect(workspace.execute(jobFinish)).toMatchObject({ ok: true, report: { match: { score: null } } });
});

it("does not exceed global issue limits or accept over-sized batches", () => {
  const workspace = createReviewWorkspace(context, {});
  expect(workspace.execute({ action: "submit_review_issues", arguments: { issues: Array.from({ length: 4 }, (_, index) => ({ ...issue, title: `Issue ${index}` })) } }).ok).toBe(false);
  for (let index = 0; index < 40; index++) expect(workspace.execute({ action: "submit_review_issues", arguments: { issues: [{ ...issue, title: `Issue ${index}` }] } }).ok).toBe(true);
  expect(workspace.execute({ action: "submit_review_issues", arguments: { issues: [{ ...issue, title: "Another issue" }] } })).toMatchObject({ ok: false, error: "result_limit" });
  expect(workspace.snapshot().issues).toHaveLength(40);
});

it("treats object-property-like target IDs as ordinary unread content", () => {
  const workspace = createReviewWorkspace({ contentHash: "special-ids", targets: ["constructor", "__proto__"].map((id) => ({ id, sectionId: "section", blockPath: [id], text: "Visible resume content" })) }, {});
  expect(workspace.summary().unreadTargets).toBe(2);
  workspace.execute({ action: "read_review_content", arguments: {} });
  expect(workspace.summary().unreadTargets).toBe(0);
  grade(workspace);
  expect(workspace.execute(finish).ok).toBe(true);
});

it("validates whole batches atomically and deduplicates accepted entries", () => {
  const workspace = createReviewWorkspace(context, {});
  workspace.execute({ action: "read_review_content", arguments: {} });
  const invalid = { ...issue, evidence: [{ targetId: "another-user", quote: "export queue" }] };
  expect(workspace.execute({ action: "submit_review_issues", arguments: { issues: [issue, invalid] } }).ok).toBe(false);
  expect(workspace.snapshot().issues).toHaveLength(0);
  for (let i = 0; i < 2; i++) expect(workspace.execute({ action: "submit_review_issues", arguments: { issues: [issue] } }).ok).toBe(true);
  expect(workspace.snapshot().issues).toHaveLength(1);
  grade(workspace);
  expect(workspace.execute(finish)).toMatchObject({ ok: true, report: { issues: [{ id: "issue-1" }] } });
});

it("rejects invented job requirements, arbitrary tools and premature finalization", () => {
  const workspace = createReviewWorkspace(context, { jobDescription: "Experience with TypeScript" });
  expect(workspace.execute({ action: "execute_sql", arguments: { sql: "select *" } }).ok).toBe(false);
  expect(workspace.execute({ action: "submit_review_match", arguments: { requirements: [{ text: "Ten years experience", source: "description", importance: "required", status: "not_demonstrated", evidence: [], reason: "Not found" }] } }).ok).toBe(false);
  expect(workspace.execute({ ...finish, arguments: { ...finish.arguments, matchSummary: "Not enough information" } }).ok).toBe(false);
  const general = createReviewWorkspace(context, {});
  expect(general.execute({ action: "submit_review_match", arguments: { requirements: [] } }).ok).toBe(false);
});
