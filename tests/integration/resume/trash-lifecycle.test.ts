import { and, eq } from "drizzle-orm";
import { db, resumes, resumeVersions } from "@/db";
import { getManagedConfigDefaults } from "@/lib/config/registry";
import { paginateTrashedResumes, restoreTrashedResume, purgeTrashedResume } from "@/lib/resume/trash/service";
import {
  createResumeRecord, deleteResumeRecord, getPublishedResumeBySlug,
  getResumeRecord, paginateResumeEntries, publishResumeRecord,
  resetResumeRepository, saveResumeRecord,
} from "@/lib/resume/repository";

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: async () => ({ values: getManagedConfigDefaults() }),
}));

const owner = "trash-owner";
const id = "trash-resume";
async function raw() {
  const [row] = await db.select().from(resumes).where(and(eq(resumes.userId, owner), eq(resumes.id, id)));
  return row;
}

describe("resume trash lifecycle", () => {
  beforeEach(async () => { await resetResumeRepository(); await createResumeRecord(owner, id); });
  afterEach(() => resetResumeRepository());

  it("keeps the document and history while hiding a deleted resume from all ordinary reads", async () => {
    const published = await publishResumeRecord(owner, id);
    await deleteResumeRecord(owner, id);
    const row = await raw();
    expect(row?.document).toEqual(published.document);
    expect(row?.published).toBe(false);
    expect(row?.version).toBe(published.version + 1);
    expect(row!.purgeAfter!.getTime() - row!.deletedAt!.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(await db.select().from(resumeVersions)).toHaveLength(1);
    expect(await getResumeRecord(owner, id)).toBeUndefined();
    expect(await getPublishedResumeBySlug(published.slug!)).toBeUndefined();
    expect((await paginateResumeEntries({ userId: owner, page: 1, pageSize: 10 })).items).toEqual([]);
    await expect(saveResumeRecord({ userId: owner, resumeId: id, version: published.version, document: published.document }))
      .rejects.toMatchObject({ message: "resume_trashed" });
  });

  it("does not extend retention on repeat deletion and does not authorize another owner", async () => {
    await deleteResumeRecord(owner, id);
    const first = await raw();
    expect(first).toBeDefined();
    await deleteResumeRecord(owner, id);
    expect(await raw()).toEqual(first);
    await expect(deleteResumeRecord("other", id)).rejects.toMatchObject({ name: "ResumeNotFoundError" });
  });

  it("restores the original record without republishing and rejects stale editor writes", async () => {
    const original = await publishResumeRecord(owner, id);
    await deleteResumeRecord(owner, id);
    const page = await paginateTrashedResumes({ userId: owner, page: 1, pageSize: 10 });
    expect(page.items[0]).toMatchObject({ id, recoverable: true });
    expect(page.items[0]).not.toHaveProperty("document");
    expect((await paginateTrashedResumes({ userId: "other", page: 1, pageSize: 10 })).items).toEqual([]);
    await expect(restoreTrashedResume({ userId: "other", resumeId: id })).rejects.toMatchObject({ name: "ResumeNotFoundError" });
    const restored = await restoreTrashedResume({ userId: owner, resumeId: id });
    expect(restored).toMatchObject({ id, published: false, version: original.version + 2 });
    expect((await getResumeRecord(owner, id))?.document).toEqual(original.document);
    await expect(saveResumeRecord({ userId: owner, resumeId: id, version: original.version, document: original.document }))
      .rejects.toMatchObject({ name: "ResumeVersionConflictError" });
    expect((await paginateTrashedResumes({ userId: owner, page: 1, pageSize: 10 })).items).toEqual([]);
  });

  it("refuses expired recovery even before maintenance and only purges trashed records", async () => {
    await expect(purgeTrashedResume({ userId: owner, resumeId: id })).rejects.toMatchObject({ name: "ResumeNotFoundError" });
    await publishResumeRecord(owner, id);
    await deleteResumeRecord(owner, id);
    await db.update(resumes).set({ deletedAt: new Date("2020-01-01Z"), purgeAfter: new Date("2020-01-31Z") }).where(eq(resumes.id, id));
    await expect(restoreTrashedResume({ userId: owner, resumeId: id })).rejects.toMatchObject({ message: "resume_trash_expired" });
    expect((await paginateTrashedResumes({ userId: owner, page: 1, pageSize: 10 })).items[0]?.recoverable).toBe(false);
    await purgeTrashedResume({ userId: owner, resumeId: id });
    expect(await raw()).toBeUndefined();
    expect(await db.select().from(resumeVersions)).toHaveLength(0);
  });
});
