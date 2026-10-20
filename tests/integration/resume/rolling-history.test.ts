import { and, eq } from "drizzle-orm";
import { db, resumeVersions } from "@/db";
import { getManagedConfigDefaults } from "@/lib/config/registry";
import { validateResumeDocument } from "@/domain/resume/validation";
import {
  createResumeRecord,
  getResumeRecord,
  paginateResumeVersionSnapshots,
  resetResumeRepository,
  restoreResumeVersion,
  saveResumeRecord,
  saveResumeRecordWithExecutor,
  snapshotResumeVersion,
} from "@/lib/resume/repository";

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: async () => ({
    values: { ...getManagedConfigDefaults(), resumeVersionHistoryLimit: 1 },
  }),
}));

const userId = "rolling-owner";
const resumeId = "rolling-resume";
async function automatic() {
  return db
    .select()
    .from(resumeVersions)
    .where(
      and(
        eq(resumeVersions.userId, userId),
        eq(resumeVersions.kind, "autosave"),
      ),
    );
}
async function save(title: string, version: number) {
  const current = await getResumeRecord(userId, resumeId);
  const document = structuredClone(current!.document);
  document.meta.title = title;
  return saveResumeRecord({ userId, resumeId, document, version });
}

describe("rolling pre-save history", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createResumeRecord(userId, resumeId);
  });
  afterEach(() => resetResumeRepository());

  it("retains the server document immediately before the latest changed save independently of normal history", async () => {
    const retained = await snapshotResumeVersion(userId, resumeId);
    const first = await save("B", 1);
    const oldId = (await automatic())[0]?.id;
    await save("C", first.version);
    const [point] = await automatic();
    expect(validateResumeDocument(point?.document).meta.title).toBe("B");
    expect(point?.version).toBe(first.version);
    expect(point?.id).not.toBe(oldId);
    expect(await automatic()).toHaveLength(1);
    const page = await paginateResumeVersionSnapshots({
      userId,
      resumeId,
      page: 1,
      pageSize: 10,
    });
    expect(page.items.map((item) => item.id)).toEqual([retained.id]);
  });

  it("does not replace the point for identical content, summary changes or conflicting saves", async () => {
    const first = await save("B", 1);
    const before = await automatic();
    expect(before).toHaveLength(1);
    const unchanged = await save("B", first.version);
    const summary = await saveResumeRecord({
      userId,
      resumeId,
      version: unchanged.version,
      summary: "New summary",
    });
    await expect(save("C", 1)).rejects.toMatchObject({
      currentVersion: summary.version,
    });
    expect(await automatic()).toEqual(before);
  });

  it("rolls back both the new document and rolling point when the surrounding transaction fails", async () => {
    const first = await save("B", 1);
    const before = await automatic();
    const document = structuredClone(first.document);
    document.meta.title = "C";
    await expect(
      db.transaction(async (transaction) => {
        await saveResumeRecordWithExecutor(transaction, {
          userId,
          resumeId,
          version: first.version,
          document,
        });
        throw new Error("transaction interrupted");
      }),
    ).rejects.toThrow("transaction interrupted");
    expect((await getResumeRecord(userId, resumeId))?.document.meta.title).toBe(
      "B",
    );
    expect(await automatic()).toEqual(before);
  });

  it("allows only one concurrent writer and records its actual predecessor", async () => {
    const current = await getResumeRecord(userId, resumeId);
    const results = await Promise.allSettled([save("B", 1), save("C", 1)]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await automatic())[0]?.document).toEqual(current!.document);
    expect(await automatic()).toHaveLength(1);
  });

  it("can undo restoring an automatic snapshot even with normal history limited to one", async () => {
    const first = await save("B", 1);
    const second = await save("C", first.version);
    const [point] = await automatic();
    expect(point).toBeDefined();
    const restored = await restoreResumeVersion({
      userId,
      resumeId,
      version: second.version,
      snapshotId: point!.id,
    });
    expect(restored.document.meta.title).toBe("B");
    const history = await paginateResumeVersionSnapshots({
      userId,
      resumeId,
      page: 1,
      pageSize: 10,
    });
    expect(history.items).toHaveLength(1);
    const undone = await restoreResumeVersion({
      userId,
      resumeId,
      version: restored.version,
      snapshotId: history.items[0]!.id,
    });
    expect(undone.document.meta.title).toBe("C");
  });

  it("can pin a rolling target before saving outstanding edits replaces the automatic point", async () => {
    const first = await save("B", 1);
    const second = await save("C", first.version);
    const [point] = await automatic();
    const pinned = await snapshotResumeVersion(userId, resumeId, point!.id);
    const third = await save("D", second.version);
    const restored = await restoreResumeVersion({
      userId,
      resumeId,
      version: third.version,
      snapshotId: pinned.id,
    });
    expect(restored.document.meta.title).toBe("B");
  });
});
