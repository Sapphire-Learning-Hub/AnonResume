import { isOwnedResumeReview } from "@/lib/ai/review/repository";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  jobApplications,
  jobOpportunities,
  jobSearchOperations,
  aiRuns,
  aiResumeReviews,
} from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";
import { createReviewFixture } from "../../support/ai-review";
import { createOpportunity } from "@/lib/job-search/opportunities";
import { getReviewContext } from "@/lib/job-search/reviews";
import { prepareResumeReviewRun } from "@/lib/ai/review/service";
it("validates review job ownership in admission, links the real record without leaking IDs to the provider, and retains jobs after report deletion", async () => {
  const fixture = await createReviewFixture();
  const pool = getDatabasePool();
  await pool.query(
    'INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,\'Review job\',$2,true,now(),now())',
    [fixture.userId, `${fixture.userId}@example.test`],
  );
  try {
    const job = await createOpportunity(fixture.userId, {
      title: "Engineer",
      description: "JD",
      operationId: randomUUID(),
    });
    const context = {
      opportunityId: job.opportunity.id,
      applicationId: job.applicationId!,
    };
    const wrong = { opportunityId: randomUUID() };
    await expect(
      prepareResumeReviewRun({
        ...fixture,
        input: {
          ...fixture.input,
          targetRole: "Engineer",
          jobDescription: "JD",
        },
        jobContext: wrong,
      }),
    ).rejects.toThrow("not_found");
    expect(
      await db.select().from(aiRuns).where(eq(aiRuns.userId, fixture.userId)),
    ).toHaveLength(0);
    const prepared = await prepareResumeReviewRun({
      ...fixture,
      input: { ...fixture.input, targetRole: "Engineer", jobDescription: "JD" },
      jobContext: context,
    });
    expect(
      await isOwnedResumeReview(
        fixture.userId,
        fixture.resumeId,
        prepared.reviewId,
      ),
    ).toBe(true);
    expect(
      await isOwnedResumeReview(
        fixture.userId,
        randomUUID(),
        prepared.reviewId,
      ),
    ).toBe(false);
    expect(
      await isOwnedResumeReview(
        randomUUID(),
        fixture.resumeId,
        prepared.reviewId,
      ),
    ).toBe(false);
    expect(await getReviewContext(fixture.userId, prepared.reviewId)).toEqual(
      context,
    );
    expect(JSON.stringify(prepared.request.messages)).not.toContain(
      job.opportunity.id,
    );
    await db
      .delete(aiResumeReviews)
      .where(eq(aiResumeReviews.id, prepared.reviewId));
    expect(
      await db
        .select()
        .from(jobOpportunities)
        .where(eq(jobOpportunities.id, job.opportunity.id)),
    ).toHaveLength(1);
    expect(
      await getReviewContext(fixture.userId, prepared.reviewId),
    ).toBeNull();
  } finally {
    await db
      .delete(jobApplications)
      .where(eq(jobApplications.userId, fixture.userId));
    await db
      .delete(jobOpportunities)
      .where(eq(jobOpportunities.userId, fixture.userId));
    await db
      .delete(jobSearchOperations)
      .where(eq(jobSearchOperations.userId, fixture.userId));
    await fixture.cleanup();
    await pool.query('DELETE FROM "user" WHERE id=$1', [fixture.userId]);
  }
});
