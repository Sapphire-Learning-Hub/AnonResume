import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import {
  db,
  resumeAssets,
  resumes,
  resumeVersions,
  resumeTemplates,
  pdfExportJobs,
} from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createImageBlock } from "@/domain/resume/images/model";
import {
  createGeneratedResumeRecord,
  saveResumeRecord,
  publishResumeRecord,
  unpublishResumeRecord,
  deleteResumeRecord,
} from "@/lib/resume/repository";
import { authorizedImage } from "@/lib/resume/assets/authorization";
import { createPdfExportWorkerToken } from "@/lib/pdf/export-queue";
import {
  uploadImage,
  ownedImage,
  readImage,
  removeImage,
  listImages,
} from "@/lib/resume/assets/service";
import { cleanupImages } from "@/lib/resume/assets/maintenance";
import { savePersonalTemplate } from "@/lib/resume/templates/service";
import { getManagedConfigDefaults } from "@/lib/config/registry";

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: async () => {
    const { systemConfigRevisions } = await import("@/db");
    const [active] = await db
      .select({ id: systemConfigRevisions.id })
      .from(systemConfigRevisions)
      .where(eq(systemConfigRevisions.status, "active"));
    return {
      values: getManagedConfigDefaults(),
      desiredRevisionId: active?.id ?? null,
      hotRevisionId: active?.id ?? null,
    };
  },
}));
let currentUserId: string | null = null;
let workerToken: string | undefined;
vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: async () =>
    currentUserId ? { user: { id: currentUserId } } : null,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (workerToken ? { value: workerToken } : undefined),
  }),
}));
const userId = `images-${crypto.randomUUID()}`;
let directory: string;
beforeEach(async () => {
  currentUserId = null;
  workerToken = undefined;
  directory = await mkdtemp(join(tmpdir(), "images-lifecycle-"));
  vi.stubEnv("ANONRESUME_IMAGE_DIR", directory);
  await getDatabasePool().query(
    `INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,'Images',$2,true,now(),now())`,
    [userId, `${userId}@example.test`],
  );
});
afterEach(async () => {
  await db.delete(resumeTemplates).where(eq(resumeTemplates.userId, userId));
  await db.delete(resumes).where(eq(resumes.userId, userId));
  await db.delete(resumeAssets).where(eq(resumeAssets.userId, userId));
  await getDatabasePool().query('DELETE FROM "user" WHERE id = $1', [userId]);
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
async function upload() {
  return uploadImage(
    userId,
    "Portrait",
    await sharp({
      create: { width: 600, height: 800, channels: 3, background: "white" },
    })
      .png()
      .toBuffer(),
  );
}

it("stores private immutable pixels, refuses foreign references and resolves dimensions on the server", async () => {
  const asset = await upload();
  expect((await listImages(userId)).items).toHaveLength(1);
  await expect(ownedImage("other", asset.id)).rejects.toMatchObject({
    code: "image_not_found",
  });
  const document = createDefaultResumeDocument();
  document.sections[0]!.blocks.push(createImageBlock(asset));
  await expect(
    createGeneratedResumeRecord({ userId: "other", document }),
  ).rejects.toMatchObject({ code: "image_not_found" });
  const resume = await createGeneratedResumeRecord({ userId, document });
  expect(resume.document.schemaVersion).toBe(2);
  const image = resume.document.sections[0]!.blocks.at(-1)!;
  if (image.type !== "image") throw new Error("Expected image");
  image.intrinsicWidth = 12;
  const saved = await saveResumeRecord({
    userId,
    resumeId: resume.id,
    version: 1,
    document: resume.document,
  });
  expect(saved.document.sections[0]!.blocks.at(-1)).toMatchObject({
    intrinsicWidth: 600,
    intrinsicHeight: 800,
  });
});

it("keeps hidden image files for history, trash and templates, then cleans unreferenced files", async () => {
  const asset = await upload();
  const document = createDefaultResumeDocument();
  document.sections[0]!.blocks.push(createImageBlock(asset));
  const resume = await createGeneratedResumeRecord({ userId, document });
  await savePersonalTemplate(userId, {
    resumeId: resume.id,
    sourceVersion: 1,
    name: "Photo",
    operationId: crypto.randomUUID(),
  });
  const withoutImage = createDefaultResumeDocument();
  await saveResumeRecord({
    userId,
    resumeId: resume.id,
    version: 1,
    document: withoutImage,
  });
  await deleteResumeRecord(userId, resume.id);
  // The live document no longer references the image; its recovery point does.
  await db.delete(resumeTemplates).where(eq(resumeTemplates.userId, userId));
  await removeImage(userId, asset.id);
  expect((await listImages(userId)).items).toHaveLength(0);
  const future = new Date(Date.now() + 31 * 86400000);
  expect(await cleanupImages({ now: future })).toEqual({
    removed: 0,
    failed: 0,
  });
  expect(
    (await readImage(await ownedImage(userId, asset.id), "original")).length,
  ).toBeGreaterThan(0);
  await db.delete(resumeVersions).where(eq(resumeVersions.userId, userId));
  // A trashed document itself also protects its pictures.
  await db
    .update(resumes)
    .set({ document: resume.document })
    .where(eq(resumes.id, resume.id));
  expect((await cleanupImages({ now: future })).removed).toBe(0);
  await db
    .insert(resumeTemplates)
    .values({
      id: crypto.randomUUID(),
      userId,
      name: "Only remaining reference",
      document: resume.document,
      schemaVersion: 2,
    });
  await db.delete(resumes).where(eq(resumes.userId, userId));
  expect((await cleanupImages({ now: future })).removed).toBe(0);
  await db.delete(resumeTemplates).where(eq(resumeTemplates.userId, userId));
  expect(await cleanupImages({ now: future })).toEqual({
    removed: 1,
    failed: 0,
  });
  await expect(ownedImage(userId, asset.id)).rejects.toMatchObject({
    code: "image_not_found",
  });
});

it("releases quota after invalid uploads without removing deletion tombstones prematurely", async () => {
  await expect(
    uploadImage(userId, "invalid", Buffer.from("invalid")),
  ).rejects.toMatchObject({ code: "image_invalid" });
  const [row] = await db
    .select()
    .from(resumeAssets)
    .where(eq(resumeAssets.userId, userId));
  expect(row).toMatchObject({ state: "deleting", bytes: 0 });
  expect(await cleanupImages()).toEqual({ removed: 1, failed: 0 });
  expect((await listImages(userId)).usedBytes).toBe(0);
});

it("limits private, public and worker reads to their actual authorization and revokes publication and task access", async () => {
  const asset = await upload();
  const unused = await upload();
  await expect(authorizedImage(asset.id, {})).rejects.toMatchObject({
    code: "image_not_found",
  });
  currentUserId = "other";
  await expect(authorizedImage(asset.id, {})).rejects.toMatchObject({
    code: "image_not_found",
  });
  currentUserId = userId;
  expect((await authorizedImage(asset.id, {})).id).toBe(asset.id);
  const document = createDefaultResumeDocument();
  document.sections[0]!.blocks.push(createImageBlock(asset));
  const resume = await createGeneratedResumeRecord({ userId, document });
  const published = await publishResumeRecord(userId, resume.id);
  currentUserId = null;
  expect((await authorizedImage(asset.id, { slug: published.slug })).id).toBe(
    asset.id,
  );
  await expect(
    authorizedImage(unused.id, { slug: published.slug }),
  ).rejects.toMatchObject({ code: "image_not_found" });
  await unpublishResumeRecord(userId, resume.id);
  await expect(
    authorizedImage(asset.id, { slug: published.slug }),
  ).rejects.toMatchObject({ code: "image_not_found" });
  const jobId = crypto.randomUUID();
  await db.insert(pdfExportJobs).values({
    id: jobId,
    resumeUserId: userId,
    resumeId: resume.id,
    status: "running",
    accessTokenHash: "unused",
    document: resume.document,
    filename: "test.pdf",
  });
  await expect(authorizedImage(asset.id, { jobId })).rejects.toMatchObject({
    code: "image_not_found",
  });
  workerToken = createPdfExportWorkerToken(jobId);
  expect((await authorizedImage(asset.id, { jobId })).id).toBe(asset.id);
  await expect(authorizedImage(unused.id, { jobId })).rejects.toMatchObject({
    code: "image_not_found",
  });
  await db
    .update(pdfExportJobs)
    .set({ cancelRequested: true })
    .where(eq(pdfExportJobs.id, jobId));
  await expect(authorizedImage(asset.id, { jobId })).rejects.toMatchObject({
    code: "image_not_found",
  });
});

it("counts existing and reserved bytes when concurrent uploads hit the account quota", async () => {
  const asset = await upload();
  await db
    .update(resumeAssets)
    .set({ bytes: 200 * 1024 * 1024 })
    .where(eq(resumeAssets.id, asset.id));
  const requests = await Promise.allSettled([upload(), upload()]);
  expect(
    requests.every(
      (result) =>
        result.status === "rejected" &&
        result.reason.code === "image_quota_exceeded",
    ),
  ).toBe(true);
  expect((await listImages(userId)).items).toHaveLength(1);
});
