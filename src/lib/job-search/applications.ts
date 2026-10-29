import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { jobApplications } from "@/db";
import {
  changeStageSchema,
  createApplicationSchema,
  updateApplicationSchema,
  revisionSchema,
} from "@/domain/job-search/schema";
import { resolveStageChange } from "@/domain/job-search/stages";
import { mutateJob, jobOperation } from "./transaction";
import {
  assertOwnedResume,
  ownedApplication,
  ownedOpportunity,
  insertEvent,
  jobSnapshot,
  touchApplication,
} from "./records";
import { checkVersion, JobSearchError, jobErrorCodes } from "./errors";
import { getApplication } from "./queries";

export async function createApplication(
  userId: string,
  raw: z.input<typeof createApplicationSchema>,
) {
  const input = createApplicationSchema.parse(raw);
  const result = await mutateJob(userId, (tx) =>
    jobOperation(
      tx,
      userId,
      input.operationId,
      "create_application",
      input,
      async () => {
        const job = await ownedOpportunity(tx, userId, input.opportunityId);
        await assertOwnedResume(tx, userId, input.resumeId);
        const id = randomUUID();
        await tx.insert(jobApplications).values({
          id,
          userId,
          opportunityId: job.id,
          snapshot: jobSnapshot(job),
          resumeId: input.resumeId,
          channel: input.channel,
          notes: input.notes,
        });
        await insertEvent(tx, userId, id, "created");
        return { id };
      },
    ),
  );
  return getApplication(userId, result.id);
}
export async function updateApplication(
  userId: string,
  id: string,
  raw: z.input<typeof updateApplicationSchema>,
) {
  const input = updateApplicationSchema.parse(raw);
  await mutateJob(userId, (tx) =>
    jobOperation(
      tx,
      userId,
      input.operationId,
      "update_application",
      { id, ...input },
      async () => {
        const row = await ownedApplication(tx, userId, id);
        checkVersion(row.version, input.version);
        if (input.resumeId !== row.resumeId)
          await assertOwnedResume(tx, userId, input.resumeId);
        const patch = {
          resumeId: input.resumeId,
          channel: input.channel,
          notes: input.notes,
          ...(input.archived === undefined ? {} : { archived: input.archived }),
        };
        await touchApplication(tx, row, patch);
        const kind =
          input.archived !== undefined && input.archived !== row.archived
            ? input.archived
              ? "archived"
              : "unarchived"
            : "updated";
        await insertEvent(tx, userId, id, kind);
        return { id };
      },
    ),
  );
  return getApplication(userId, id);
}
export async function changeApplicationStage(
  userId: string,
  id: string,
  raw: z.input<typeof changeStageSchema>,
) {
  const input = changeStageSchema.parse(raw);
  await mutateJob(userId, (tx) =>
    jobOperation(
      tx,
      userId,
      input.operationId,
      "change_stage",
      { id, ...input },
      async () => {
        const row = await ownedApplication(tx, userId, id);
        checkVersion(row.version, input.version);
        let next;
        try {
          next = resolveStageChange({
            from: row.stage,
            to: input.stage,
            appliedAt: row.appliedAt?.toISOString() ?? null,
            nextAppliedAt: input.appliedAt,
            confirmReset: input.confirmReset,
            now: new Date(),
          });
        } catch (error) {
          const code = jobErrorCodes.find(
            (code) => error instanceof Error && code === error.message,
          );
          if (code) throw new JobSearchError(code);
          throw error;
        }
        if (
          row.stage === input.stage &&
          next.appliedAt === (row.appliedAt?.toISOString() ?? null)
        )
          return { id };
        await touchApplication(tx, row, {
          stage: input.stage,
          appliedAt: next.appliedAt ? new Date(next.appliedAt) : null,
        });
        await insertEvent(tx, userId, id, "stage_changed", {
          fromStage: row.stage,
          toStage: input.stage,
          body:
            row.appliedAt && row.appliedAt.toISOString() !== next.appliedAt
              ? row.appliedAt.toISOString()
              : "",
          occurredAt:
            row.stage === "pending" &&
            input.stage === "applied" &&
            next.appliedAt
              ? new Date(next.appliedAt)
              : new Date(),
        });
        return { id };
      },
    ),
  );
  return getApplication(userId, id);
}
export const syncJobSchema = revisionSchema
  .extend({ opportunityVersion: z.number().int().positive() })
  .strict();
export async function syncApplicationJob(
  userId: string,
  id: string,
  raw: z.input<typeof syncJobSchema>,
) {
  const input = syncJobSchema.parse(raw);
  await mutateJob(userId, (tx) =>
    jobOperation(
      tx,
      userId,
      input.operationId,
      "sync_job",
      { id, ...input },
      async () => {
        const row = await ownedApplication(tx, userId, id);
        checkVersion(row.version, input.version);
        if (row.stage !== "pending")
          throw new JobSearchError("application_already_submitted");
        if (!row.opportunityId) throw new JobSearchError("not_found");
        const job = await ownedOpportunity(tx, userId, row.opportunityId);
        checkVersion(job.version, input.opportunityVersion);
        await touchApplication(tx, row, { snapshot: jobSnapshot(job) });
        await insertEvent(tx, userId, id, "synced");
        return { id };
      },
    ),
  );
  return getApplication(userId, id);
}
export async function deleteApplication(
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
      "delete_application",
      { id, ...input },
      async () => {
        const row = await ownedApplication(tx, userId, id);
        checkVersion(row.version, input.version);
        await tx
          .delete(jobApplications)
          .where(
            and(eq(jobApplications.userId, userId), eq(jobApplications.id, id)),
          );
        return { id };
      },
    ),
  );
  return { deleted: true as const };
}
