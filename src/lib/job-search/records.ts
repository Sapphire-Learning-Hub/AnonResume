import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  jobOpportunities,
  jobApplications,
  jobApplicationEvents,
  resumes,
} from "@/db";
import {
  jobSnapshotSchema,
  type ApplicationStage,
  type ApplicationEventKind,
  type JobSnapshot,
} from "@/domain/job-search/schema";
import type { JobReader, JobTransaction } from "./transaction";
import { JobSearchError } from "./errors";
export async function ownedOpportunity(
  tx: JobReader,
  userId: string,
  id: string,
  lockOwnership = false,
) {
  const query = tx
    .select()
    .from(jobOpportunities)
    .where(
      and(eq(jobOpportunities.userId, userId), eq(jobOpportunities.id, id)),
    )
    .limit(1);
  const [row] = await (lockOwnership ? query.for("share") : query);
  if (!row) throw new JobSearchError("not_found");
  return row;
}
export async function ownedApplication(
  tx: JobReader,
  userId: string,
  id: string,
  lockOwnership = false,
) {
  const query = tx
    .select()
    .from(jobApplications)
    .where(and(eq(jobApplications.userId, userId), eq(jobApplications.id, id)))
    .limit(1);
  const [row] = await (lockOwnership ? query.for("share") : query);
  if (!row) throw new JobSearchError("not_found");
  return row;
}
export function jobSnapshot(row: {
  title: string;
  company: string;
  description: string;
  url: string;
  source: string;
}): JobSnapshot {
  return jobSnapshotSchema.parse({
    title: row.title,
    company: row.company,
    description: row.description,
    url: row.url,
    source: row.source,
  });
}
export async function assertOwnedResume(
  tx: JobReader,
  userId: string,
  resumeId: string | null,
) {
  if (!resumeId) return;
  const [row] = await tx
    .select({ id: resumes.id })
    .from(resumes)
    .where(
      and(
        eq(resumes.userId, userId),
        eq(resumes.id, resumeId),
        eq(resumes.kind, "standard"),
        isNull(resumes.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new JobSearchError("not_found");
}
export async function insertEvent(
  tx: JobTransaction,
  userId: string,
  applicationId: string,
  kind: ApplicationEventKind,
  options: {
    body?: string;
    fromStage?: ApplicationStage;
    toStage?: ApplicationStage;
    occurredAt?: Date;
  } = {},
) {
  const id = randomUUID();
  await tx.insert(jobApplicationEvents).values({
    id,
    userId,
    applicationId,
    kind,
    body: options.body ?? "",
    fromStage: options.fromStage,
    toStage: options.toStage,
    occurredAt: options.occurredAt ?? new Date(),
  });
  return id;
}
export async function touchApplication(
  tx: JobTransaction,
  row: typeof jobApplications.$inferSelect,
  patch: Partial<typeof jobApplications.$inferInsert> = {},
) {
  const now = new Date();
  await tx
    .update(jobApplications)
    .set({
      ...patch,
      version: row.version + 1,
      activityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobApplications.userId, row.userId),
        eq(jobApplications.id, row.id),
        eq(jobApplications.version, row.version),
      ),
    );
}
