import { eq } from "drizzle-orm";
import {
  aiModels,
  aiProviderCredentials,
  aiRuns,
  db,
  pdfExportJobs,
  resumes,
} from "@/db";
import {
  createResumeRecord,
  deleteResumeRecord,
  getResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";
import { restoreTrashedResume } from "@/lib/resume/trash/service";
import { runResumeTrashMaintenance } from "@/lib/resume/trash/maintenance";

async function expired(id: string) {
  await createResumeRecord("owner", id);
  await deleteResumeRecord("owner", id);
  await db
    .update(resumes)
    .set({
      deletedAt: new Date("2020-01-01Z"),
      purgeAfter: new Date("2020-01-31Z"),
    })
    .where(eq(resumes.id, id));
}

describe("resume trash maintenance", () => {
  beforeEach(() => resetResumeRepository());
  afterEach(async () => {
    await resetResumeRepository();
    await db.delete(aiProviderCredentials);
  });

  it("purges due records once across concurrent instances while preserving recoverable and active records", async () => {
    await expired("due");
    await createResumeRecord("owner", "recoverable");
    await deleteResumeRecord("owner", "recoverable");
    await createResumeRecord("owner", "active");
    const results = await Promise.all([
      runResumeTrashMaintenance(),
      runResumeTrashMaintenance(),
    ]);
    expect(results.reduce((sum, result) => sum + result.purged, 0)).toBe(1);
    expect(
      (await db.select({ id: resumes.id }).from(resumes))
        .map((row) => row.id)
        .sort(),
    ).toEqual(["active", "recoverable"]);
  });

  it("does not delete a resume restored before cleanup", async () => {
    await createResumeRecord("owner", "restored");
    await deleteResumeRecord("owner", "restored");
    await restoreTrashedResume({ userId: "owner", resumeId: "restored" });
    expect((await runResumeTrashMaintenance()).purged).toBe(0);
    expect(await getResumeRecord("owner", "restored")).toBeDefined();
  });

  it("defers physical deletion while a cancelled worker still holds its job", async () => {
    await createResumeRecord("owner", "busy");
    const record = await getResumeRecord("owner", "busy");
    const [job] = await db
      .insert(pdfExportJobs)
      .values({
        resumeUserId: "owner",
        resumeId: "busy",
        document: record!.document,
        filename: "test.pdf",
        accessTokenHash: "test",
        status: "running",
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    await deleteResumeRecord("owner", "busy");
    await db
      .update(resumes)
      .set({
        deletedAt: new Date("2020-01-01Z"),
        purgeAfter: new Date("2020-01-31Z"),
      })
      .where(eq(resumes.id, "busy"));
    expect(await runResumeTrashMaintenance()).toMatchObject({
      purged: 0,
      deferred: 1,
    });
    await db
      .update(pdfExportJobs)
      .set({ status: "cancelled", leaseExpiresAt: null })
      .where(eq(pdfExportJobs.id, job!.id));
    expect((await runResumeTrashMaintenance()).purged).toBe(1);
  });

  it("preserves unsettled AI usage instead of cascading it away or declaring it free", async () => {
    await createResumeRecord("owner", "unsettled");
    const [provider] = await db
      .insert(aiProviderCredentials)
      .values({
        kind: "platform",
        displayName: "Test",
        baseUrl: "https://example.invalid/v1",
        encryptedApiKey: Buffer.from("unused-test-fixture"),
      })
      .returning();
    const [model] = await db
      .insert(aiModels)
      .values({
        providerId: provider!.id,
        providerModelKey: "test",
        displayName: "Test",
        contextWindow: 8000,
        maxOutputTokens: 1000,
        inputPointRate: 1,
        cachedInputPointRate: 1,
        outputPointRate: 1,
      })
      .returning();
    const [run] = await db
      .insert(aiRuns)
      .values({
        kind: "resume_review",
        userId: "owner",
        resumeId: "unsettled",
        modelId: model!.id,
        keySource: "platform",
        status: "settlement_pending",
        resumeVersion: 1,
        contextHash: "test",
        promptVersion: 1,
        reservedPoints: 42,
        startedAt: new Date(),
      })
      .returning();
    await deleteResumeRecord("owner", "unsettled");
    await db
      .update(resumes)
      .set({
        deletedAt: new Date("2020-01-01Z"),
        purgeAfter: new Date("2020-01-31Z"),
      })
      .where(eq(resumes.id, "unsettled"));
    expect(await runResumeTrashMaintenance()).toMatchObject({
      purged: 0,
      deferred: 1,
    });
    const [preserved] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, run!.id));
    expect(preserved).toMatchObject({
      status: "settlement_pending",
      finalPoints: null,
      reservedPoints: 42,
    });
  });
});
