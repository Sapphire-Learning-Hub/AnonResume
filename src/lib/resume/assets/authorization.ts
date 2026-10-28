import { getOptionalSession } from "@/lib/auth/session";
import { getPublishedResumeBySlug } from "@/lib/resume/repository";
import { collectImageAssetIds } from "@/domain/resume/images/model";
import {
  getPdfExportDocumentForWorker,
  getPdfExportQueueConfig,
} from "@/lib/pdf/export-queue";
import { getRuntimeConfig } from "@/lib/config/runtime";
import { cookies } from "next/headers";
import { PDF_EXPORT_WORKER_COOKIE } from "@/lib/http/request-authorization";
import { db, pdfExportJobs } from "@/db";
import { eq } from "drizzle-orm";
import { ownedImage } from "./service";
import { ImageAssetError } from "./errors";

export async function authorizedImage(
  id: string,
  access: { slug?: string; jobId?: string },
) {
  if (access.slug && access.jobId) throw new ImageAssetError("image_invalid");
  if (access.slug) {
    const resume = await getPublishedResumeBySlug(access.slug);
    if (!resume || !collectImageAssetIds(resume.document).includes(id))
      throw new ImageAssetError("image_not_found");
    return ownedImage(resume.userId, id);
  }
  if (access.jobId) {
    const token = (await cookies()).get(PDF_EXPORT_WORKER_COOKIE)?.value;
    if (!token) throw new ImageAssetError("image_not_found");
    const { values } = await getRuntimeConfig("web");
    const job = await getPdfExportDocumentForWorker(
      { jobId: access.jobId, workerToken: token },
      getPdfExportQueueConfig(values),
    ).catch(() => null);
    if (!job || !collectImageAssetIds(job.document).includes(id))
      throw new ImageAssetError("image_not_found");
    const [row] = await db
      .select({ userId: pdfExportJobs.resumeUserId })
      .from(pdfExportJobs)
      .where(eq(pdfExportJobs.id, access.jobId));
    if (!row) throw new ImageAssetError("image_not_found");
    return ownedImage(row.userId, id);
  }
  const session = await getOptionalSession();
  if (!session) throw new ImageAssetError("image_not_found");
  return ownedImage(session.user.id, id);
}
