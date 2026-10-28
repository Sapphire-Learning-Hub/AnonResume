import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import {
  resumeAssets,
  resumes,
  resumeVersions,
  resumeTemplates,
  pdfExportJobs,
} from "@/db";
import { collectImageAssetIds } from "@/domain/resume/images/model";
import { visitResumeBlocks } from "@/domain/resume/block-tree";
import { validateResumeDocument } from "@/domain/resume/validation";
import type { ResumeDocument } from "@/domain/resume/schema";
import type { ResumeTransaction } from "@/lib/resume/transaction";
import { ImageAssetError } from "./errors";

export async function assertOwnedDocumentAssets(
  tx: Pick<ResumeTransaction, "select">,
  userId: string,
  document: ResumeDocument,
) {
  const ids = collectImageAssetIds(document).sort();
  if (!ids.length) return document;
  // The same row locks are held until every document write commits, excluding GC.
  const rows = await tx
    .select()
    .from(resumeAssets)
    .where(and(eq(resumeAssets.userId, userId), inArray(resumeAssets.id, ids)))
    .orderBy(asc(resumeAssets.id))
    .for("update");
  if (rows.length !== ids.length || rows.some((row) => row.state !== "ready"))
    throw new ImageAssetError("image_not_found");
  const dimensions = new Map(rows.map((row) => [row.id, row]));
  const resolved = structuredClone(document);
  for (const section of resolved.sections)
    visitResumeBlocks(section.blocks, (block) => {
      if (block.type !== "image") return;
      const asset = dimensions.get(block.assetId)!;
      // Intrinsic metadata is authoritative on the server, including plain Markdown references.
      block.intrinsicWidth = asset.width;
      block.intrinsicHeight = asset.height;
    });
  return resolved;
}

export async function referencedImageIds(
  tx: ResumeTransaction,
  userId: string,
) {
  const documents = [
    ...(await tx
      .select({ document: resumes.document })
      .from(resumes)
      .where(eq(resumes.userId, userId))),
    ...(await tx
      .select({ document: resumeVersions.document })
      .from(resumeVersions)
      .where(eq(resumeVersions.userId, userId))),
    ...(await tx
      .select({ document: resumeTemplates.document })
      .from(resumeTemplates)
      .where(eq(resumeTemplates.userId, userId))),
    ...(await tx
      .select({ document: pdfExportJobs.document })
      .from(pdfExportJobs)
      .where(
        and(
          eq(pdfExportJobs.resumeUserId, userId),
          or(
            inArray(pdfExportJobs.status, ["queued", "running"]),
            gt(pdfExportJobs.resultExpiresAt, new Date()),
          ),
        ),
      )),
  ];
  // Invalid persisted documents stop cleanup rather than risk deleting their files.
  return new Set(
    documents.flatMap((row) =>
      collectImageAssetIds(validateResumeDocument(row.document)),
    ),
  );
}
