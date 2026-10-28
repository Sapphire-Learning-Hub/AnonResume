import { and, count, desc, eq, ilike, isNull, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { db, resumeAssets, systemConfigRevisions } from "@/db";
import { getRuntimeConfig } from "@/lib/config/runtime";
import { lockTemplateAccount } from "@/lib/resume/templates/operations";
import { TemplateError } from "@/lib/resume/templates/errors";
import { ImageAssetError } from "./errors";
import { imageStorage, imageStorageLocation } from "./storage";
import { IMAGE_RESERVATION_BYTES, processImage } from "./processing";

export const imageNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export const imageIdSchema = z.string().uuid();
type AssetRow = typeof resumeAssets.$inferSelect;
export function assetSummary(row: AssetRow) {
  return {
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    createdAt: row.createdAt.toISOString(),
  };
}
export async function ownedImage(userId: string, id: string) {
  imageIdSchema.parse(id);
  const [row] = await db
    .select()
    .from(resumeAssets)
    .where(
      and(
        eq(resumeAssets.userId, userId),
        eq(resumeAssets.id, id),
        eq(resumeAssets.state, "ready"),
      ),
    );
  if (!row) throw new ImageAssetError("image_not_found");
  return row;
}
let processing = 0;
export async function uploadImage(userId: string, name: string, input: Buffer) {
  const parsedName = imageNameSchema.parse(name);
  const runtime = await getRuntimeConfig("web");
  const config = runtime.values;
  if (!config.imagesEnabled) throw new ImageAssetError("image_upload_disabled");
  if (input.length > config.imageUploadLimitMiB * 1024 * 1024)
    throw new ImageAssetError("image_too_large");
  if (processing >= 2) throw new ImageAssetError("image_busy");
  processing += 1;
  const id = crypto.randomUUID();
  const location = imageStorageLocation(config);
  let reserved = false;
  let storageStarted = false;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('anonresume:system-config:publish'))`,
      );
      const [active] = await tx
        .select({ id: systemConfigRevisions.id })
        .from(systemConfigRevisions)
        .where(eq(systemConfigRevisions.status, "active"));
      if (
        active &&
        (runtime.desiredRevisionId !== active.id ||
          runtime.hotRevisionId !== active.id)
      )
        throw new ImageAssetError("image_busy");
      try {
        await lockTemplateAccount(tx, userId);
      } catch (error) {
        if (error instanceof TemplateError)
          throw new ImageAssetError("image_not_found");
        throw error;
      }
      const [usage] = await tx
        .select({
          bytes: sum(resumeAssets.bytes),
          pending: count(
            sql`CASE WHEN ${resumeAssets.state} = 'uploading' THEN 1 END`,
          ),
        })
        .from(resumeAssets)
        .where(eq(resumeAssets.userId, userId));
      if (usage.pending >= 2) throw new ImageAssetError("image_busy");
      if (
        Number(usage.bytes ?? 0) + IMAGE_RESERVATION_BYTES >
        config.imageAccountQuotaMiB * 1024 * 1024
      )
        throw new ImageAssetError("image_quota_exceeded");
      await tx.insert(resumeAssets).values({
        id,
        userId,
        name: parsedName,
        state: "uploading",
        location,
        bytes: IMAGE_RESERVATION_BYTES,
      });
    });
    reserved = true;
    const result = await processImage(input);
    const storage = imageStorage(config);
    try {
      storageStarted = true;
      await storage.put(`${id}/original.webp`, result.original);
      await storage.put(`${id}/thumbnail.webp`, result.thumbnail);
    } catch {
      throw new ImageAssetError("image_storage_unavailable");
    }
    const [row] = await db
      .update(resumeAssets)
      .set({
        state: "ready",
        width: result.width,
        height: result.height,
        bytes: result.original.length + result.thumbnail.length,
        digest: result.digest,
      })
      .where(
        and(
          eq(resumeAssets.id, id),
          eq(resumeAssets.userId, userId),
          eq(resumeAssets.state, "uploading"),
        ),
      )
      .returning();
    if (!row) throw new ImageAssetError("image_storage_unavailable");
    return assetSummary(row);
  } catch (error) {
    if (reserved) {
      // Keep the tombstone until both files are removed; partial writes are retryable.
      await db
        .update(resumeAssets)
        .set({
          state: "deleting",
          removedAt: new Date(),
          ...(storageStarted ? {} : { bytes: 0 }),
        })
        .where(eq(resumeAssets.id, id));
    }
    throw error;
  } finally {
    processing -= 1;
  }
}

export async function listImages(
  userId: string,
  input: { query?: string; page?: number } = {},
) {
  const query = z
    .string()
    .max(100)
    .parse(input.query ?? "");
  const page = z
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(input.page ?? 1);
  const filter = and(
    eq(resumeAssets.userId, userId),
    eq(resumeAssets.state, "ready"),
    isNull(resumeAssets.removedAt),
    ilike(resumeAssets.name, `%${query.replace(/[\\%_]/g, "\\$&")}%`),
  );
  const rows = await db
    .select()
    .from(resumeAssets)
    .where(filter)
    .orderBy(desc(resumeAssets.createdAt), desc(resumeAssets.id))
    .limit(20)
    .offset((page - 1) * 20);
  const [total] = await db
    .select({ value: count() })
    .from(resumeAssets)
    .where(filter);
  const [usage] = await db
    .select({ bytes: sum(resumeAssets.bytes) })
    .from(resumeAssets)
    .where(eq(resumeAssets.userId, userId));
  const { values } = await getRuntimeConfig("web");
  return {
    items: rows.map(assetSummary),
    total: total.value,
    page,
    usedBytes: Number(usage.bytes ?? 0),
    quotaBytes: values.imageAccountQuotaMiB * 1024 * 1024,
    uploadLimitBytes: values.imageUploadLimitMiB * 1024 * 1024,
    uploadEnabled: values.imagesEnabled,
  };
}
export async function renameImage(userId: string, id: string, name: string) {
  const value = imageNameSchema.parse(name);
  await ownedImage(userId, id);
  await db
    .update(resumeAssets)
    .set({ name: value })
    .where(
      and(
        eq(resumeAssets.id, id),
        eq(resumeAssets.userId, userId),
        eq(resumeAssets.state, "ready"),
        isNull(resumeAssets.removedAt),
      ),
    );
}
export async function removeImage(userId: string, id: string) {
  await ownedImage(userId, id);
  await db
    .update(resumeAssets)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(resumeAssets.id, id),
        eq(resumeAssets.userId, userId),
        isNull(resumeAssets.removedAt),
      ),
    );
}
export async function readImage(
  row: AssetRow,
  variant: "original" | "thumbnail",
) {
  const { values } = await getRuntimeConfig("web");
  if (row.location !== imageStorageLocation(values))
    throw new ImageAssetError("image_storage_unavailable");
  try {
    return await imageStorage(values).get(`${row.id}/${variant}.webp`);
  } catch {
    throw new ImageAssetError("image_storage_unavailable");
  }
}
