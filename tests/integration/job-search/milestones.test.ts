import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  jobApplications,
  jobOpportunities,
  jobSearchOperations,
  jobApplicationEvents,
} from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";
import { createOpportunity } from "@/lib/job-search/opportunities";
import { changeApplicationStage } from "@/lib/job-search/applications";
import { addFollowup } from "@/lib/job-search/events";
import { getApplication } from "@/lib/job-search/queries";
import {
  listGanttApplications,
  listStageMilestones,
} from "@/lib/job-search/gantt";
const userId = randomUUID(),
  other = randomUUID();
beforeEach(async () => {
  for (const id of [userId, other])
    await getDatabasePool().query(
      'INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,\'Milestone test\',$2,true,now(),now())',
      [id, `${id}@example.test`],
    );
});
afterEach(async () => {
  for (const id of [userId, other]) {
    await db.delete(jobApplications).where(eq(jobApplications.userId, id));
    await db.delete(jobOpportunities).where(eq(jobOpportunities.userId, id));
    await db
      .delete(jobSearchOperations)
      .where(eq(jobSearchOperations.userId, id));
    await getDatabasePool().query('DELETE FROM "user" WHERE id=$1', [id]);
  }
});
it("returns only real stage changes with their occurrence dates and rejection source, without leaking another user's timeline", async () => {
  const saved = await createOpportunity(userId, {
    operationId: randomUUID(),
    title: "Engineer",
  });
  let app = await getApplication(userId, saved.applicationId!);
  app = await changeApplicationStage(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    stage: "applied",
    appliedAt: "2026-10-01T08:00:00Z",
  });
  app = await changeApplicationStage(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    stage: "interview_1",
  });
  app = await changeApplicationStage(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    stage: "rejected",
  });
  app = await changeApplicationStage(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    stage: "rejected",
    appliedAt: "2026-10-02T08:00:00Z",
  });
  await addFollowup(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    body: "Private followup",
    occurredAt: "2030-01-01T00:00:00Z",
  });
  const result = await listGanttApplications(userId, {});
  const stages = result.items[0]!.milestones;
  expect(stages.total).toBe(4);
  expect(stages.nextCursor).toBeNull();
  expect(
    stages.items.find((stage) => stage.stage === "applied")?.occurredAt,
  ).toBe("2026-10-01T08:00:00.000Z");
  expect(
    stages.items.find((stage) => stage.stage === "rejected"),
  ).toMatchObject({ fromStage: "interview_1" });
  expect(JSON.stringify(stages)).not.toContain("Private followup");
  expect((await listGanttApplications(other, {})).items).toHaveLength(0);
  await expect(listStageMilestones(other, app.id, {})).rejects.toThrow(
    "not_found",
  );
});
it("bounds initial milestones and can retrieve all older transitions with timestamp ties without gaps", async () => {
  const saved = await createOpportunity(userId, {
    operationId: randomUUID(),
    title: "Many stages",
  });
  let app = await getApplication(userId, saved.applicationId!);
  for (let i = 0; i < 56; i++)
    app = await changeApplicationStage(userId, app.id, {
      operationId: randomUUID(),
      version: app.version,
      stage: i % 2 ? "interview_1" : "applied",
      appliedAt: "2026-10-01T08:00:00Z",
    });
  await db
    .update(jobApplicationEvents)
    .set({ occurredAt: new Date("2026-10-15T00:00:00Z") })
    .where(eq(jobApplicationEvents.applicationId, app.id));
  const initial = (await listGanttApplications(userId, {})).items[0]!
    .milestones;
  expect(initial.items).toHaveLength(50);
  expect(initial.total).toBe(57);
  expect(initial.nextCursor).toBeTruthy();
  const older = await listStageMilestones(userId, app.id, {
    cursor: initial.nextCursor!,
    limit: 50,
  });
  expect(older.items).toHaveLength(7);
  expect(older.nextCursor).toBeNull();
  expect(older.total).toBe(57);
  expect(
    [...initial.items, ...older.items].map((event) => event.stage),
  ).toEqual([
    ...Array.from({ length: 56 }, (_, index) =>
      index % 2 ? "applied" : "interview_1",
    ),
    "pending",
  ]);
  expect(
    new Set([...initial.items, ...older.items].map((event) => event.id)).size,
  ).toBe(57);
});
