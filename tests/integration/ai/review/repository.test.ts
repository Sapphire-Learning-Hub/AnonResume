import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { aiResumeReviews, aiRuns, db, resumes, getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";
import { prepareResumeReviewRun } from "@/lib/ai/review/service";
import { getOwnedResumeReview, listOwnedResumeReviews, setOwnedReviewIssueIgnored, deleteOwnedResumeReview } from "@/lib/ai/review/repository";
import { validateReviewResult } from "@/domain/resume/ai/review/validation";
import { buildReviewContext } from "@/domain/resume/ai/review/context";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { createReviewFixture, reviewOutput } from "../../../support/ai-review";
import { getDatabaseBackendPid, waitForDatabaseOperationBlockedBy } from "../../../support/postgres";

it("does not lock the report before its run when deletion overlaps finalization", async () => {
  const fixture = await createReviewFixture();
  const client = await getDatabasePool().connect();
  let deletion: Promise<boolean> | undefined;
  try {
    const run = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    await db.update(aiRuns).set({ status: "complete" }).where(eq(aiRuns.id, run.runId));
    const schema = `"${getDatabaseSchemaName().replaceAll('"', '""')}"`;
    await client.query("BEGIN");
    await client.query(`SELECT id FROM ${schema}.ai_runs WHERE id = $1 FOR UPDATE`, [run.runId]);
    deletion = deleteOwnedResumeReview({ userId: fixture.userId, reviewId: run.reviewId });
    void deletion.catch(() => undefined);
    await waitForDatabaseOperationBlockedBy(await getDatabaseBackendPid(client));
    // Finalization already owns the run; it must still be able to lock its report.
    await expect(client.query(`SELECT id FROM ${schema}.ai_resume_reviews WHERE id = $1 FOR UPDATE NOWAIT`, [run.reviewId])).resolves.toBeDefined();
  } finally {
    await client.query("ROLLBACK");
    client.release();
    try { await deletion; } finally { await fixture.cleanup(); }
  }
});

it("returns a deliberate conflict for simultaneous reviews even when the user may run multiple tasks", async () => {
  const fixture = await createReviewFixture();
  try {
    const configuration = { ...fixture.configuration, maxConcurrentRuns: 2 };
    await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration });
    await expect(prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration })).rejects.toMatchObject({ name: "AiRunAlreadyActiveError" });
    expect(await db.select().from(aiRuns).where(eq(aiRuns.userId, fixture.userId))).toHaveLength(1);
  } finally { await fixture.cleanup(); }
});

it("isolates reports and preserves scoring while handling changed content and deletion", async () => {
  const fixture = await createReviewFixture();
  try {
    const run = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const report = validateReviewResult({ ...reviewOutput(), issues: [{ dimension: "clarity", severity: "suggestion", kind: "missing", title: "Scope", explanation: "Explain scope", suggestion: "Add real scope", evidence: [] }] }, buildReviewContext(fixture.document), {});
    await db.update(aiResumeReviews).set({ report }).where(eq(aiResumeReviews.id, run.reviewId));
    await db.update(aiRuns).set({ status: "complete" }).where(eq(aiRuns.id, run.runId));
    expect(await getOwnedResumeReview({ userId: randomUUID(), reviewId: run.reviewId })).toBeNull();
    expect((await listOwnedResumeReviews({ userId: randomUUID(), resumeId: fixture.resumeId })).items).toEqual([]);
    const ignored = await setOwnedReviewIssueIgnored({ userId: fixture.userId, reviewId: run.reviewId, issueId: "issue-1", ignored: true });
    expect(ignored?.ignoredIssueIds).toEqual(["issue-1"]);
    expect(ignored?.report?.score).toBe(75);
    expect(ignored?.stale).toBe(false);
    fixture.document.sections[0]!.title = createRichTextFromPlainText("Updated");
    await db.update(resumes).set({ document: fixture.document, version: 2 }).where(eq(resumes.id, fixture.resumeId));
    expect((await getOwnedResumeReview({ userId: fixture.userId, reviewId: run.reviewId }))?.stale).toBe(true);
    expect(await deleteOwnedResumeReview({ userId: randomUUID(), reviewId: run.reviewId })).toBe(false);
    expect(await deleteOwnedResumeReview({ userId: fixture.userId, reviewId: run.reviewId })).toBe(true);
    expect(await getOwnedResumeReview({ userId: fixture.userId, reviewId: run.reviewId })).toBeNull();
    expect(await db.select().from(aiRuns).where(eq(aiRuns.id, run.runId))).toHaveLength(1);
  } finally { await fixture.cleanup(); }
});
