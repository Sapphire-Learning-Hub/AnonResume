import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, resumeAssets, systemConfigRevisions } from "@/db";
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
