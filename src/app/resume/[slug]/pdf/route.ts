import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import { createPdfFilename } from "@/lib/shared/download-filename";
import {
  getPdfExportWorkerAvailability,
  PDF_EXPORT_OFFLINE_POLL_MS,
} from "@/lib/pdf/export-availability";
import {
  enqueuePdfExport,
  getPdfExportQueueConfig,
  PdfExportQueueFullError,
  PdfExportUserQueueLimitError,
  warnIfAnonymousPdfExportIsEnabled,
} from "@/lib/pdf/export-queue";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { getPublishedResumeBySlug } from "@/lib/resume/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);

  if (forbiddenResponse) {
    return forbiddenResponse;
  }

  const { slug } = await params;
  const resume = await getPublishedResumeBySlug(slug);

  if (!resume) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await getOptionalSession();
  const queueConfig = getPdfExportQueueConfig();

  if (!session && !queueConfig.allowAnonymous) {
    return NextResponse.json(
      { error: "anonymous_pdf_export_disabled" },
      { status: 403 },
    );
  }

  if (!session) {
    warnIfAnonymousPdfExportIsEnabled();
  }

  const worker = await getPdfExportWorkerAvailability();

  if (!worker.available) {
    return NextResponse.json(
      { error: "pdf_worker_unavailable" },
      {
        status: 503,
        headers: {
          "Retry-After": String(PDF_EXPORT_OFFLINE_POLL_MS / 1_000),
        },
      },
    );
  }

  try {
    const queued = await enqueuePdfExport({
      resumeUserId: resume.userId,
      resumeId: resume.id,
      requesterUserId: session?.user.id,
      document: resume.document,
      filename: createPdfFilename(resume.title || resume.slug),
    });

    return NextResponse.json(
      {
        job: {
          id: queued.jobId,
          accessToken: queued.accessToken,
          status: "queued",
        },
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof PdfExportQueueFullError) {
      return NextResponse.json({ error: "queue_full" }, { status: 429 });
    }

    if (error instanceof PdfExportUserQueueLimitError) {
      return NextResponse.json(
        {
          error: "user_queue_limit",
          limit: queueConfig.maxActivePerUser,
        },
        { status: 429 },
      );
    }

    throw error;
  }
}
