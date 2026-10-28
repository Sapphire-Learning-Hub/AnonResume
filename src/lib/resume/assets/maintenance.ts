import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { db, resumeAssets } from "@/db";
import { getRuntimeConfig } from "@/lib/config/runtime";
import { getLogger, serializeSafeError } from "@/lib/observability/logging";
import { referencedImageIds } from "./references";
import { imageStorage, imageStorageLocation } from "./storage";

export async function cleanupImages(
  input: { now?: Date; limit?: number } = {},
) {
  const now = input.now ?? new Date();
  const removedBefore = new Date(now.getTime() - 30 * 86400000);
  const uploadBefore = new Date(now.getTime() - 86400000);
  const candidates = await db
    .select({ id: resumeAssets.id })
    .from(resumeAssets)
    .where(
      or(
        eq(resumeAssets.state, "deleting"),
        and(
          eq(resumeAssets.state, "uploading"),
          lt(resumeAssets.createdAt, uploadBefore),
        ),
        and(
          eq(resumeAssets.state, "ready"),
          lt(resumeAssets.removedAt, removedBefore),
        ),
      ),
    )
    .orderBy(
      sql`${resumeAssets.checkedAt} ASC NULLS FIRST`,
      asc(resumeAssets.createdAt),
    )
    .limit(Math.max(1, Math.min(input.limit ?? 100, 500)));
  const { values } = await getRuntimeConfig("web");
  let removed = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const row = await db.transaction(async (tx) => {
        const [asset] = await tx
          .select()
          .from(resumeAssets)
          .where(eq(resumeAssets.id, candidate.id))
          .for("update");
        if (!asset) return null;
        await tx
          .update(resumeAssets)
          .set({ checkedAt: now })
          .where(eq(resumeAssets.id, asset.id));
        if (asset.state !== "deleting") {
          if (asset.state === "uploading" && asset.createdAt >= uploadBefore)
            return null;
          if (
            asset.state === "ready" &&
            (!asset.removedAt || asset.removedAt >= removedBefore)
          )
            return null;
          if ((await referencedImageIds(tx, asset.userId)).has(asset.id))
            return null;
          await tx
            .update(resumeAssets)
            .set({ state: "deleting" })
            .where(eq(resumeAssets.id, asset.id));
        }
        return asset;
      });
      if (!row) continue;
      if (row.location !== imageStorageLocation(values))
        throw new Error("image_storage_location_mismatch");
      const storage = imageStorage(values);
      await storage.remove(`${row.id}/original.webp`);
      await storage.remove(`${row.id}/thumbnail.webp`);
      await db
        .delete(resumeAssets)
        .where(
          and(eq(resumeAssets.id, row.id), eq(resumeAssets.state, "deleting")),
        );
      removed += 1;
    } catch (error) {
      failed += 1;
      getLogger("anonresume.images").error("image_cleanup_failed", {
        error: serializeSafeError(error),
        outcome: "failure",
      });
    }
  }
  return { removed, failed };
}
