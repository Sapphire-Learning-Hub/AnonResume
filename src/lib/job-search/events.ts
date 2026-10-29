import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { jobApplicationEvents } from "@/db";
import {
  followupSchema,
  editFollowupSchema,
  deleteFollowupSchema,
} from "@/domain/job-search/schema";
import { mutateJob, jobOperation } from "./transaction";
import { ownedApplication, insertEvent, touchApplication } from "./records";
import { checkVersion, JobSearchError } from "./errors";
import { getApplication } from "./queries";
export async function addFollowup(
  userId: string,
  id: string,
  raw: z.input<typeof followupSchema>,
) {
  const input = followupSchema.parse(raw);
  await mutateJob(userId, (tx) =>
    jobOperation(
      tx,
      userId,
      input.operationId,
      "add_followup",
      { id, ...input },
      async () => {
        const row = await ownedApplication(tx, userId, id);
        checkVersion(row.version, input.version);
        await insertEvent(tx, userId, id, "followup", {
          body: input.body,
          occurredAt: new Date(input.occurredAt),
        });
        await touchApplication(tx, row);
        return { id };
      },
    ),
  );
  return getApplication(userId, id);
}
export async function updateFollowup(
  userId: string,
  id: string,
  eventId: string,
  raw: z.input<typeof editFollowupSchema>,
) {
  return mutateFollowup(
    userId,
    id,
    eventId,
    editFollowupSchema.parse(raw),
    false,
  );
}
export async function deleteFollowup(
  userId: string,
  id: string,
  eventId: string,
  raw: z.input<typeof deleteFollowupSchema>,
) {
  return mutateFollowup(
    userId,
    id,
    eventId,
    deleteFollowupSchema.parse(raw),
    true,
  );
}
async function mutateFollowup(
  userId: string,
  id: string,
  eventId: string,
  input: z.infer<typeof deleteFollowupSchema> & {
    body?: string;
    occurredAt?: string;
  },
  remove: boolean,
) {
  await mutateJob(userId, (tx) =>
    jobOperation(
      tx,
      userId,
      input.operationId,
      remove ? "delete_followup" : "update_followup",
      { id, eventId, ...input },
      async () => {
        const row = await ownedApplication(tx, userId, id);
        checkVersion(row.version, input.version);
        const filter = and(
          eq(jobApplicationEvents.userId, userId),
          eq(jobApplicationEvents.applicationId, id),
          eq(jobApplicationEvents.id, eventId),
        );
        const [event] = await tx
          .select()
          .from(jobApplicationEvents)
          .where(filter)
          .limit(1);
        if (!event) throw new JobSearchError("not_found");
        if (event.kind !== "followup")
          throw new JobSearchError("system_event_immutable");
        checkVersion(event.version, input.eventVersion);
        if (remove) await tx.delete(jobApplicationEvents).where(filter);
        else
          await tx
            .update(jobApplicationEvents)
            .set({
              body: input.body,
              occurredAt: input.occurredAt
                ? new Date(input.occurredAt)
                : event.occurredAt,
              updatedAt: new Date(),
              version: event.version + 1,
            })
            .where(filter);
        await touchApplication(tx, row);
        return { id };
      },
    ),
  );
  return getApplication(userId, id);
}
