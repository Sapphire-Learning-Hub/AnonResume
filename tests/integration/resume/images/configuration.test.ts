import { randomBytes } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, resumeAssets, systemConfigRevisions, systemConfigValues } from "@/db";
import { createConfigKeyring } from "@/lib/config/crypto";
import {
  ensureConfigurationState,
  getConfigurationState,
  publishConfigurationDraft,
  readActiveConfigSnapshot,
  updateConfigurationDraft,
} from "@/lib/config/store";

it("blocks storage relocation with existing images but permits preparing an unused S3 configuration", async () => {
  const keyring = createConfigKeyring({ current: randomBytes(32) });
  const assetId = crypto.randomUUID();
  await db.delete(systemConfigRevisions);
  await ensureConfigurationState({ keyring });
  const state = await getConfigurationState({ keyring });
  const input = {
    actorUserId: "image-configuration-test",
    baseVersion: state.activeRevision.version,
    draftRevisionId: state.draftRevision.id,
    keyring,
  };
  await db.insert(resumeAssets).values({
    id: assetId,
    userId: "image-configuration-test",
    name: "Existing image",
    state: "ready",
    location: "existing-storage",
    bytes: 1,
    width: 1,
    height: 1,
  });
  try {
    await updateConfigurationDraft({
      ...input,
      values: {
        imageStorage: "s3",
        imageS3Region: "us-east-1",
        imageS3Bucket: "test-images",
        imageS3AccessKeyId: "test-key",
        imageS3SecretAccessKey: "test-secret",
      },
    });
    await expect(publishConfigurationDraft(input)).rejects.toMatchObject({
      message: "image_storage_in_use",
    });
    expect(
      (await readActiveConfigSnapshot({ keyring })).values.imageStorage,
    ).toBe("local");
    await updateConfigurationDraft({
      ...input,
      values: { imageStorage: "local", imagesEnabled: false },
    });
    await publishConfigurationDraft(input);
    const active = await readActiveConfigSnapshot({ keyring });
    expect(active.values.imageStorage).toBe("local");
    expect(active.values.imagesEnabled).toBe(false);
  } finally {
    await db.delete(resumeAssets).where(eq(resumeAssets.id, assetId));
    await db.delete(systemConfigRevisions);
  }
});

it("pins the legacy directory once when upgrading configuration snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "image-directory-upgrade-"));
  vi.stubEnv("ANONRESUME_IMAGE_DIR", relative(process.cwd(), root));
  const keyring = createConfigKeyring({ current: randomBytes(32) });
  await db.delete(systemConfigRevisions);
  try {
    await ensureConfigurationState({ keyring });
    await db.delete(systemConfigValues).where(eq(systemConfigValues.key, "imageLocalDirectory"));
    await ensureConfigurationState({ keyring });
    expect((await readActiveConfigSnapshot({ keyring })).values.imageLocalDirectory).toBe(root);
    vi.stubEnv("ANONRESUME_IMAGE_DIR", "/var/lib/different-images");
    await ensureConfigurationState({ keyring });
    expect((await readActiveConfigSnapshot({ keyring })).values.imageLocalDirectory).toBe(root);
    const state = await getConfigurationState({ keyring });
    expect(state.fields.find((field) => field.key === "imageLocalDirectory")).toMatchObject({ value: root, public: false });
  } finally {
    await db.delete(systemConfigRevisions);
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

it("serializes directory publication behind an in-flight upload reservation", async () => {
  const root = await mkdtemp(join(tmpdir(), "image-config-race-"));
  vi.stubEnv("ANONRESUME_IMAGE_DIR", root);
  const keyring = createConfigKeyring({ current: randomBytes(32) });
  const assetId = crypto.randomUUID();
  await db.delete(systemConfigRevisions);
  let release!: () => void;
  let ready!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const acquired = new Promise<void>((resolve) => { ready = resolve; });
  try {
    await ensureConfigurationState({ keyring });
    const state = await getConfigurationState({ keyring });
    const input = { actorUserId: "directory-race", baseVersion: state.activeRevision.version, draftRevisionId: state.draftRevision.id, keyring };
    await updateConfigurationDraft({ ...input, values: { imageLocalDirectory: join(root, "relocated") } });
    const reservation = db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('anonresume:system-config:publish'))`);
      ready();
      await held;
      await tx.insert(resumeAssets).values({ id: assetId, userId: "directory-race", name: "Pending upload", state: "uploading", location: "original", bytes: 1 });
    });
    await acquired;
    const publication = publishConfigurationDraft(input);
    const rejected = expect(publication).rejects.toMatchObject({ message: "image_storage_in_use" });
    release();
    await Promise.all([reservation, rejected]);
    expect((await readActiveConfigSnapshot({ keyring })).values.imageLocalDirectory).toBe(root);
  } finally {
    release();
    await db.delete(resumeAssets).where(eq(resumeAssets.id, assetId));
    await db.delete(systemConfigRevisions);
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});

it("publishes one private directory and refuses relocation while uploads or deletions exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "managed-image-config-"));
  vi.stubEnv("ANONRESUME_IMAGE_DIR", root);
  const keyring = createConfigKeyring({ current: randomBytes(32) });
  const assetId = crypto.randomUUID();
  await db.delete(systemConfigRevisions);
  try {
    await ensureConfigurationState({ keyring });
    const initial = await getConfigurationState({ keyring });
    const input = { actorUserId: "directory-config", baseVersion: initial.activeRevision.version, draftRevisionId: initial.draftRevision.id, keyring };
    await updateConfigurationDraft({ ...input, values: { imageLocalDirectory: join(root, "photos/private") } });
    await publishConfigurationDraft(input);
    expect((await stat(join(root, "photos/private"))).isDirectory()).toBe(true);
    expect((await readActiveConfigSnapshot({ keyring })).values.imageLocalDirectory).toBe(join(root, "photos/private"));
    const active = await getConfigurationState({ keyring });
    const next = { ...input, baseVersion: active.activeRevision.version, draftRevisionId: active.draftRevision.id };
    await db.insert(resumeAssets).values({ id: assetId, userId: "directory-config", name: "Reserved upload", state: "uploading", location: "reserved", bytes: 1 });
    await updateConfigurationDraft({ ...next, values: { imageLocalDirectory: root } });
    await expect(publishConfigurationDraft(next)).rejects.toMatchObject({ message: "image_storage_in_use" });
    await db.update(resumeAssets).set({ state: "deleting" }).where(eq(resumeAssets.id, assetId));
    await expect(publishConfigurationDraft(next)).rejects.toMatchObject({ message: "image_storage_in_use" });
    expect((await readActiveConfigSnapshot({ keyring })).values.imageLocalDirectory).toBe(join(root, "photos/private"));
  } finally {
    await db.delete(resumeAssets).where(eq(resumeAssets.id, assetId));
    await db.delete(systemConfigRevisions);
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  }
});
