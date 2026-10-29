import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  jobOpportunities,
  jobApplications,
  jobApplicationEvents,
  jobSearchOperations,
  jobReviewLinks,
  resumes,
} from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";
import {
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
} from "@/lib/job-search/opportunities";
import {
  createApplication,
  changeApplicationStage,
  updateApplication,
  syncApplicationJob,
  deleteApplication,
} from "@/lib/job-search/applications";
import {
  addFollowup,
  updateFollowup,
  deleteFollowup,
} from "@/lib/job-search/events";
import {
  getApplication,
  getOpportunity,
  listOpportunities,
  listApplications,
  getApplicationBoard,
  listEvents,
} from "@/lib/job-search/queries";
const userId = `jobs-${randomUUID()}`;
const other = `jobs-${randomUUID()}`;
const job = (extra = {}) => ({
  operationId: randomUUID(),
  title: "Engineer",
  company: "Example",
  description: "A real job description",
  ...extra,
});
beforeEach(async () => {
  for (const id of [userId, other])
    await getDatabasePool().query(
      'INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,\'Job test\',$2,true,now(),now())',
      [id, `${id}@example.test`],
    );
});
afterEach(async () => {
  for (const id of [userId, other]) {
    for (const table of [
      jobReviewLinks,
      jobApplicationEvents,
      jobApplications,
      jobSearchOperations,
      jobOpportunities,
    ])
      await db.delete(table).where(eq(table.userId, id));
    await getDatabasePool().query('DELETE FROM "user" WHERE id=$1', [id]);
  }
});
it("creates private independent applications once across retries and keeps their original JD after job edits/deletion", async () => {
  const input = job();
  const saved = await createOpportunity(userId, input);
  expect(saved.applicationId).toBeTruthy();
  expect((await createOpportunity(userId, input)).applicationId).toBe(
    saved.applicationId,
  );
  await expect(
    createOpportunity(userId, { ...input, title: "Changed payload" }),
  ).rejects.toThrow("operation_conflict");
  const first = await getApplication(userId, saved.applicationId!);
  expect(first).toMatchObject({
    stage: "pending",
    appliedAt: null,
    snapshot: { description: input.description },
  });
  const second = await createApplication(userId, {
    operationId: randomUUID(),
    opportunityId: saved.opportunity.id,
  });
  await changeApplicationStage(userId, first.id, {
    operationId: randomUUID(),
    version: first.version,
    stage: "applied",
    appliedAt: "2026-10-01T10:00:00Z",
  });
  await updateOpportunity(userId, saved.opportunity.id, {
    ...job(),
    version: saved.opportunity.version,
    title: "Updated job",
    description: "Updated JD",
  });
  expect((await getApplication(userId, first.id)).snapshot.description).toBe(
    input.description,
  );
  await syncApplicationJob(userId, second.id, {
    operationId: randomUUID(),
    version: second.version,
    opportunityVersion: 2,
  });
  expect((await getApplication(userId, second.id)).snapshot.description).toBe(
    "Updated JD",
  );
  await expect(
    syncApplicationJob(userId, first.id, {
      operationId: randomUUID(),
      version: 2,
      opportunityVersion: 2,
    }),
  ).rejects.toThrow("application_already_submitted");
  await expect(getApplication(other, first.id)).rejects.toThrow("not_found");
  await expect(
    createApplication(other, {
      operationId: randomUUID(),
      opportunityId: saved.opportunity.id,
    }),
  ).rejects.toThrow("not_found");
  await deleteOpportunity(userId, saved.opportunity.id, {
    operationId: randomUUID(),
    version: 2,
  });
  expect(await getApplication(userId, first.id)).toMatchObject({
    opportunityId: null,
    snapshot: { title: "Engineer", description: input.description },
  });
});
it("atomically records progress, rejects lost updates, and requires confirmation to clear the application date", async () => {
  const saved = await createOpportunity(userId, job());
  const id = saved.applicationId!;
  const command = {
    operationId: randomUUID(),
    version: 1,
    stage: "applied" as const,
    appliedAt: "2026-10-01T10:00:00Z",
  };
  await changeApplicationStage(userId, id, command);
  await changeApplicationStage(userId, id, command);
  const page = await listEvents(userId, id, {});
  expect(page.items.filter((e) => e.kind === "stage_changed")).toHaveLength(1);
  await expect(
    updateApplication(userId, id, {
      operationId: randomUUID(),
      version: 1,
      notes: "stale",
    }),
  ).rejects.toThrow("version_conflict");
  await expect(
    changeApplicationStage(userId, id, {
      operationId: randomUUID(),
      version: 2,
      stage: "pending",
    }),
  ).rejects.toThrow("application_reset_confirmation_required");
  await changeApplicationStage(userId, id, {
    operationId: randomUUID(),
    version: 2,
    stage: "pending",
    confirmReset: true,
  });
  expect(await getApplication(userId, id)).toMatchObject({
    stage: "pending",
    appliedAt: null,
  });
  expect((await listEvents(userId, id, {})).total).toBe(3);
});
it("edits user followups with revision protection and never rewrites system timeline entries", async () => {
  const saved = await createOpportunity(userId, job());
  const id = saved.applicationId!;
  await addFollowup(userId, id, {
    operationId: randomUUID(),
    version: 1,
    body: "First interview scheduled",
    occurredAt: "2026-10-30T09:00:00Z",
  });
  const events = await listEvents(userId, id, {});
  const note = events.items.find((e) => e.kind === "followup")!;
  const system = events.items.find((e) => e.kind === "created")!;
  await expect(
    updateFollowup(userId, id, system.id, {
      operationId: randomUUID(),
      version: 2,
      eventVersion: 1,
      body: "tamper",
      occurredAt: note.occurredAt,
    }),
  ).rejects.toThrow("system_event_immutable");
  await updateFollowup(userId, id, note.id, {
    operationId: randomUUID(),
    version: 2,
    eventVersion: 1,
    body: "Second interview",
    occurredAt: note.occurredAt,
  });
  await expect(
    deleteFollowup(userId, id, note.id, {
      operationId: randomUUID(),
      version: 3,
      eventVersion: 1,
    }),
  ).rejects.toThrow("version_conflict");
  await deleteFollowup(userId, id, note.id, {
    operationId: randomUUID(),
    version: 3,
    eventVersion: 2,
  });
  expect(
    (await listEvents(userId, id, {})).items.every(
      (e) => e.kind !== "followup",
    ),
  ).toBe(true);
  await deleteApplication(userId, id, {
    operationId: randomUUID(),
    version: 4,
  });
  expect(
    await db
      .select()
      .from(jobApplicationEvents)
      .where(eq(jobApplicationEvents.applicationId, id)),
  ).toHaveLength(0);
  expect((await getOpportunity(userId, saved.opportunity.id)).title).toBe(
    "Engineer",
  );
});
it("counts all filtered cards, paginates deterministically and never mixes users or filter cursors", async () => {
  const saved = await createOpportunity(userId, job());
  for (let i = 0; i < 3; i++)
    await createApplication(userId, {
      operationId: randomUUID(),
      opportunityId: saved.opportunity.id,
      notes: `item${i}`,
    });
  await createOpportunity(other, job());
  const query = { q: "Engineer", limit: 2 };
  const first = await listApplications(userId, query);
  expect(first.total).toBe(4);
  expect(first.items).toHaveLength(2);
  const next = await listApplications(userId, {
    ...query,
    cursor: first.nextCursor!,
  });
  expect(new Set([...first.items, ...next.items].map((a) => a.id)).size).toBe(
    4,
  );
  await expect(
    listApplications(userId, {
      ...query,
      q: "Other",
      cursor: first.nextCursor!,
    }),
  ).rejects.toThrow("invalid_cursor");
  const board = await getApplicationBoard(userId, query);
  expect(board.pending.total).toBe(4);
  expect(board.applied.total).toBe(0);
  expect(
    (
      await listOpportunities(userId, {
        exactDescription: "A real job description",
      })
    ).total,
  ).toBe(1);
});

it("serializes competing application updates and writes exactly one immutable stage event", async () => {
  const saved = await createOpportunity(userId, job());
  const app = await getApplication(userId, saved.applicationId!);
  const results = await Promise.allSettled([
    changeApplicationStage(userId, app.id, {
      operationId: randomUUID(),
      version: app.version,
      stage: "applied",
      appliedAt: "2026-10-01T10:00:00Z",
    }),
    changeApplicationStage(userId, app.id, {
      operationId: randomUUID(),
      version: app.version,
      stage: "withdrawn",
    }),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason.message).toBe(
    "version_conflict",
  );
  expect(
    (await listEvents(userId, app.id, {})).items.filter(
      (event) => event.kind === "stage_changed",
    ),
  ).toHaveLength(1);
  expect((await getApplication(userId, app.id)).version).toBe(2);
});

it("authorizes resume associations and keeps unavailable links private without blocking unrelated edits", async () => {
  const ownId = randomUUID();
  const foreignId = randomUUID();
  await db.insert(resumes).values([
    {
      id: ownId,
      userId,
      name: "My resume",
      summary: "",
      document: createDefaultResumeDocument("en-US"),
    },
    {
      id: foreignId,
      userId: other,
      name: "Private resume name",
      summary: "",
      document: createDefaultResumeDocument("en-US"),
    },
  ]);
  try {
    const saved = await createOpportunity(
      userId,
      job({ createApplication: false }),
    );
    await expect(
      createApplication(userId, {
        operationId: randomUUID(),
        opportunityId: saved.opportunity.id,
        resumeId: foreignId,
      }),
    ).rejects.toThrow("not_found");
    const app = await createApplication(userId, {
      operationId: randomUUID(),
      opportunityId: saved.opportunity.id,
      resumeId: ownId,
    });
    expect(app).toMatchObject({
      resumeAvailable: true,
      resumeName: "My resume",
    });
    await db
      .update(resumes)
      .set({
        deletedAt: new Date(),
        purgeAfter: new Date(Date.now() + 30 * 86400000),
      })
      .where(eq(resumes.id, ownId));
    const hidden = await getApplication(userId, app.id);
    expect(hidden).toMatchObject({ resumeAvailable: false, resumeName: null });
    const archived = await updateApplication(userId, app.id, {
      operationId: randomUUID(),
      version: app.version,
      resumeId: ownId,
      archived: true,
    });
    expect(archived).toMatchObject({
      archived: true,
      resumeId: ownId,
      resumeAvailable: false,
    });
    await expect(
      createApplication(userId, {
        operationId: randomUUID(),
        opportunityId: saved.opportunity.id,
        resumeId: ownId,
      }),
    ).rejects.toThrow("not_found");
  } finally {
    await db.delete(resumes).where(eq(resumes.id, ownId));
    await db.delete(resumes).where(eq(resumes.id, foreignId));
  }
});

it("keeps the failure stage and terminal date stable across follow-ups and clears them on reopening", async () => {
  const saved = await createOpportunity(userId, job());
  let app = await getApplication(userId, saved.applicationId!);
  app = await changeApplicationStage(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    stage: "hr_interview",
    appliedAt: "2026-10-01T10:00:00Z",
  });
  app = await changeApplicationStage(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    stage: "rejected",
  });
  expect(app.rejectedFromStage).toBe("hr_interview");
  expect(app.closedAt).toBeTruthy();
  const ended = app.closedAt;
  app = await changeApplicationStage(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    stage: "rejected",
    appliedAt: "2026-10-02T10:00:00Z",
  });
  expect(app.closedAt).toBe(ended);
  expect(app.rejectedFromStage).toBe("hr_interview");
  app = await addFollowup(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    body: "Asked for feedback",
    occurredAt: new Date().toISOString(),
  });
  expect(app.closedAt).toBe(ended);
  expect((await listApplications(userId, {})).items[0]).toMatchObject({
    closedAt: ended,
    rejectedFromStage: "hr_interview",
  });
  app = await changeApplicationStage(userId, app.id, {
    operationId: randomUUID(),
    version: app.version,
    stage: "interview_2",
  });
  expect(app).toMatchObject({ closedAt: null, rejectedFromStage: null });
});
