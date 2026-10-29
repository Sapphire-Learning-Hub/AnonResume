import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { jobOpportunities, jobApplications, jobReviewLinks } from "@/db";
import {
  createOpportunitySchema,
  updateOpportunitySchema,
  revisionSchema,
} from "@/domain/job-search/schema";
import { mutateJob, jobOperation, descriptionHash } from "./transaction";
import { ownedOpportunity, jobSnapshot, insertEvent } from "./records";
import { checkVersion, JobSearchError } from "./errors";
import { getOpportunity } from "./queries";
import { ownedReviewInput, linkOwnedReview } from "./reviews";

export async function createOpportunity(
  userId: string,
  raw: z.input<typeof createOpportunitySchema>,
) {
  const input = createOpportunitySchema.parse(raw);
  const result = await mutateJob(userId, (tx) =>
    jobOperation(
      tx,
      userId,
      input.operationId,
      "create_opportunity",
      input,
      async () => {
        if (input.reviewId) {
          const review = await ownedReviewInput(tx, userId, input.reviewId);
          const [existing] = await tx
            .select()
            .from(jobReviewLinks)
            .where(
              and(
                eq(jobReviewLinks.userId, userId),
                eq(jobReviewLinks.reviewId, input.reviewId),
              ),
            );
          if (existing)
            return {
              id: existing.opportunityId,
              applicationId: existing.applicationId,
            };
          if (review.jobDescription?.trim() !== input.description.trim())
            throw new JobSearchError("review_context_mismatch");
        }
        const { createApplication, reviewId } = input;
        const fields = {
          title: input.title,
          company: input.company,
          description: input.description,
          url: input.url,
          source: input.source,
          notes: input.notes,
        };
        const id = randomUUID();
        const applicationId = createApplication ? randomUUID() : null;
        await tx.insert(jobOpportunities).values({
          id,
          userId,
          ...fields,
          descriptionHash: descriptionHash(fields.description),
        });
        if (applicationId) {
          await tx.insert(jobApplications).values({
            id: applicationId,
            userId,
            opportunityId: id,
            snapshot: jobSnapshot(fields),
          });
          await insertEvent(tx, userId, applicationId, "created");
        }
        if (reviewId)
          await linkOwnedReview(tx, userId, reviewId, {
            opportunityId: id,
            ...(applicationId ? { applicationId } : {}),
          });
        return { id, applicationId };
      },
    ),
  );
  return {
    opportunity: await getOpportunity(userId, result.id),
    applicationId: result.applicationId ?? null,
  };
}
export async function updateOpportunity(
  userId: string,
  id: string,
  raw: z.input<typeof updateOpportunitySchema>,
) {
  const input = updateOpportunitySchema.parse(raw);
  await mutateJob(userId, (tx) =>
    jobOperation(
      tx,
      userId,
      input.operationId,
      "update_opportunity",
      { id, ...input },
      async () => {
        const row = await ownedOpportunity(tx, userId, id);
        checkVersion(row.version, input.version);
        const fields = {
          title: input.title,
          company: input.company,
          description: input.description,
          url: input.url,
          source: input.source,
          notes: input.notes,
          ...(input.archived === undefined ? {} : { archived: input.archived }),
        };
        await tx
          .update(jobOpportunities)
          .set({
            ...fields,
            descriptionHash: descriptionHash(fields.description),
            version: row.version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(jobOpportunities.userId, userId),
              eq(jobOpportunities.id, id),
            ),
          );
        return { id };
      },
    ),
  );
  return getOpportunity(userId, id);
}
export async function deleteOpportunity(
  userId: string,
  id: string,
  raw: z.input<typeof revisionSchema>,
) {
  const input = revisionSchema.strict().parse(raw);
  await mutateJob(userId, (tx) =>
    jobOperation(
      tx,
      userId,
      input.operationId,
      "delete_opportunity",
      { id, ...input },
      async () => {
        const row = await ownedOpportunity(tx, userId, id);
        checkVersion(row.version, input.version);
        await tx
          .delete(jobOpportunities)
          .where(
            and(
              eq(jobOpportunities.userId, userId),
              eq(jobOpportunities.id, id),
            ),
          );
        return { id };
      },
    ),
  );
  return { deleted: true as const };
}
