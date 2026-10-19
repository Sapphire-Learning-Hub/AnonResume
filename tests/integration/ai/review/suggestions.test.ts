import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { aiConversations, aiMessages, aiResumeReviews, aiRuns, db, resumes } from "@/db";
import { buildReviewContext } from "@/domain/resume/ai/review/context";
import { validateReviewResult } from "@/domain/resume/ai/review/validation";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { prepareReviewSuggestions } from "@/lib/ai/review/repository";
import { prepareResumeReviewRun } from "@/lib/ai/review/service";
import { createReviewFixture, reviewOutput } from "../../../support/ai-review";

it("requires missing facts on the server and queues owned suggestions against unchanged evidence", async () => {
  const fixture = await createReviewFixture();
  try {
    const run = await prepareResumeReviewRun({ userId: fixture.userId, resumeId: fixture.resumeId, input: fixture.input, configuration: fixture.configuration });
    const context = buildReviewContext(fixture.document);
    const target = context.targets.find((entry) => entry.blockPath.length && entry.text.trim())!;
    const report = validateReviewResult({ ...reviewOutput(), issues: [
      { dimension: "impact", severity: "suggestion", kind: "missing", title: "Real results", explanation: "No results provided", suggestion: "Add actual results", evidence: [] },
      { dimension: "clarity", severity: "minor", kind: "existing", title: "Wording", explanation: "Make wording clearer", suggestion: "Simplify", evidence: [{ targetId: target.id, quote: target.text }] },
    ] }, context, {});
    await db.update(aiResumeReviews).set({ report }).where(eq(aiResumeReviews.id, run.reviewId));
    await db.update(aiRuns).set({ status: "complete" }).where(eq(aiRuns.id, run.runId));
    const input = { userId: fixture.userId, reviewId: run.reviewId, issueIds: ["issue-1"], resumeVersion: 1, configuration: fixture.configuration };
    await expect(prepareReviewSuggestions(input)).rejects.toMatchObject({ code: "ai_review_facts_required" });
    await expect(prepareReviewSuggestions({ ...input, userId: randomUUID(), supplementalFacts: "Actual results" })).rejects.toThrow();
    expect(await db.select().from(aiConversations).where(eq(aiConversations.userId, fixture.userId))).toHaveLength(0);

    const updated = structuredClone(fixture.document);
    updated.sections[0]!.title = createRichTextFromPlainText("An unrelated heading change");
    await db.update(resumes).set({ document: updated, version: 2 }).where(eq(resumes.id, fixture.resumeId));
    const result = await prepareReviewSuggestions({ ...input, issueIds: ["issue-2"], resumeVersion: 2 });
    const [suggestionRun] = await db.select().from(aiRuns).where(and(eq(aiRuns.id, result.runId), eq(aiRuns.userId, fixture.userId)));
    expect(suggestionRun).toMatchObject({ kind: "conversation", status: "queued", conversationId: result.conversationId, resumeVersion: 2 });
    const messages = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, result.conversationId));
    expect(messages.find((message) => message.role === "user")?.text).toContain("Wording");
    await db.update(aiRuns).set({ status: "stopped" }).where(eq(aiRuns.id, result.runId));

    updated.sections.forEach((section) => { section.blocks = []; });
    await db.update(resumes).set({ document: updated, version: 3 }).where(eq(resumes.id, fixture.resumeId));
    await expect(prepareReviewSuggestions({ ...input, issueIds: ["issue-2"], resumeVersion: 3 })).rejects.toMatchObject({ currentVersion: 3 });
  } finally { await fixture.cleanup(); }
});
