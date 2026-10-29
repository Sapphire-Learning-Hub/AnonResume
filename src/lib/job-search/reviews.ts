import { z } from "zod";
import { and, eq, isNull, desc, count, or, sql } from "drizzle-orm";
import { db, aiResumeReviews, aiRuns, resumes, jobReviewLinks } from "@/db";
import {
  jobContextSchema,
  type JobReviewContext,
  type JobReviewLink,
} from "@/domain/job-search/schema";
import { ownedApplication, ownedOpportunity } from "./records";
import type { JobReader, JobTransaction } from "./transaction";
import { mutateJob } from "./transaction";
import { JobSearchError } from "./errors";
export async function ownedReviewInput(
  tx: JobReader,
  userId: string,
  id: string,
) {
  const [row] = await tx
    .select({ input: aiResumeReviews.input })
    .from(aiResumeReviews)
    .innerJoin(aiRuns, eq(aiRuns.id, aiResumeReviews.runId))
    .innerJoin(
      resumes,
      and(
        eq(resumes.userId, aiRuns.userId),
        eq(resumes.id, aiRuns.resumeId),
        isNull(resumes.deletedAt),
      ),
    )
    .where(and(eq(aiRuns.userId, userId), eq(aiResumeReviews.id, id)))
    .limit(1);
  if (!row) throw new JobSearchError("not_found");
  return row.input;
}
export async function linkOwnedReview(
  tx: JobTransaction,
  userId: string,
  reviewId: string,
  raw: JobReviewContext,
) {
  const context = jobContextSchema.parse(raw);
  await ownedReviewInput(tx, userId, reviewId);
  // Admission already locks the resume. Keep ownership stable until the link commits, including during account transfer.
  await ownedOpportunity(tx, userId, context.opportunityId, true);
  if (context.applicationId) {
    const app = await ownedApplication(tx, userId, context.applicationId, true);
    if (app.opportunityId !== context.opportunityId)
      throw new JobSearchError("review_context_mismatch");
  }
  await tx
    .insert(jobReviewLinks)
    .values({
      userId,
      reviewId,
      opportunityId: context.opportunityId,
      applicationId: context.applicationId,
    })
    .onConflictDoUpdate({
      target: jobReviewLinks.reviewId,
      set: {
        opportunityId: context.opportunityId,
        applicationId: context.applicationId ?? null,
      },
      setWhere: eq(jobReviewLinks.userId, userId),
    });
}
export async function saveReviewLink(
  userId: string,
  reviewId: string,
  context: JobReviewContext,
) {
  await mutateJob(userId, (tx) =>
    linkOwnedReview(tx, userId, reviewId, context),
  );
  return { linked: true as const };
}
export async function getReviewContext(
  userId: string,
  reviewId: string,
): Promise<JobReviewContext | null> {
  const [row] = await db
    .select()
    .from(jobReviewLinks)
    .where(
      and(
        eq(jobReviewLinks.userId, userId),
        eq(jobReviewLinks.reviewId, reviewId),
      ),
    )
    .limit(1);
  return row
    ? {
        opportunityId: row.opportunityId,
        ...(row.applicationId ? { applicationId: row.applicationId } : {}),
      }
    : null;
}
export async function listJobReviews(
  userId: string,
  opportunityId: string,
  cursor?: string,
  applicationId?: string,
) {
  await ownedOpportunity(db, userId, opportunityId);
  if (applicationId) {
    const app = await ownedApplication(db, userId, applicationId);
    if (app.opportunityId !== opportunityId)
      throw new JobSearchError("not_found");
  }
  let position: { time: string; id: string } | undefined;
  if (cursor) {
    try {
      const [time, id, owner, job, app] = z
        .tuple([
          z.string().max(64),
          z.string().uuid(),
          z.string().max(200),
          z.string().uuid(),
          z.string().uuid().nullable(),
        ])
        .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      if (
        typeof time !== "string" ||
        !Number.isFinite(new Date(time).getTime()) ||
        typeof id !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(id) ||
        owner !== userId ||
        job !== opportunityId ||
        app !== (applicationId ?? null)
      )
        throw new Error();
      position = { time, id };
    } catch {
      throw new JobSearchError("invalid_cursor");
    }
  }
  const l = jobReviewLinks;
  return db.transaction(
    async (tx) => {
      const predicate = and(
        eq(l.userId, userId),
        eq(l.opportunityId, opportunityId),
        applicationId ? eq(l.applicationId, applicationId) : undefined,
      );
      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(l)
        .where(predicate);
      const rows = await tx
        .select({
          link: l,
          stamp: sql<string>`${l.createdAt}::text`,
          run: { status: aiRuns.status },
          review: { report: aiResumeReviews.report },
          resume: { id: resumes.id, name: resumes.name },
        })
        .from(l)
        .leftJoin(aiResumeReviews, eq(aiResumeReviews.id, l.reviewId))
        .leftJoin(
          aiRuns,
          and(eq(aiRuns.id, aiResumeReviews.runId), eq(aiRuns.userId, userId)),
        )
        .leftJoin(
          resumes,
          and(
            eq(resumes.id, aiRuns.resumeId),
            eq(resumes.userId, userId),
            isNull(resumes.deletedAt),
          ),
        )
        .where(
          and(
            predicate,
            position
              ? or(
                  sql`${l.createdAt}<${position.time}::timestamptz`,
                  and(
                    sql`${l.createdAt}=${position.time}::timestamptz`,
                    sql`${l.reviewId}<${position.id}::uuid`,
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(l.createdAt), desc(l.reviewId))
        .limit(21);
      const items: JobReviewLink[] = rows
        .slice(0, 20)
        .map(({ link, resume, review, run }) => ({
          reviewId: link.reviewId,
          opportunityId: link.opportunityId,
          applicationId: link.applicationId,
          available: Boolean(resume && run && review),
          resumeId: resume?.id ?? null,
          resumeName: resume?.name ?? null,
          score: resume ? (review?.report?.score ?? null) : null,
          status: resume ? (run?.status ?? null) : null,
          createdAt: link.createdAt.toISOString(),
        }));
      const last = rows[19];
      return {
        items,
        total,
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(
                JSON.stringify([
                  last.stamp,
                  last.link.reviewId,
                  userId,
                  opportunityId,
                  applicationId ?? null,
                ]),
              ).toString("base64url")
            : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
