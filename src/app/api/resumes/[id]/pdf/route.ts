import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth-session";
import { createPdfFilename } from "@/lib/download-filename";
import {
  getPdfExportWorkerAvailability,
  PDF_EXPORT_OFFLINE_POLL_MS,
} from "@/lib/pdf-export-availability";
import {
  enqueuePdfExport,
  getPdfExportQueueConfig,
  PdfExportQueueFullError,
  PdfExportUserQueueLimitError,
} from "@/lib/pdf-export-queue";
import { requireSameOrigin } from "@/lib/request-origin";
import {
  getResumeRecord,
  ResumeNotFoundError,
} from "@/lib/resume-repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);

  if (forbiddenResponse) {
    return forbiddenResponse;
  }

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const resume = await getResumeRecord(session.user.id, id);

    if (!resume) {
      throw new ResumeNotFoundError(id);
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

    const queued = await enqueuePdfExport({
      resumeUserId: session.user.id,
      resumeId: resume.id,
      requesterUserId: session.user.id,
      document: resume.document,
      filename: createPdfFilename(resume.slug || resume.title || resume.id),
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
    if (error instanceof ResumeNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (error instanceof PdfExportQueueFullError) {
      return NextResponse.json({ error: "queue_full" }, { status: 429 });
    }

    if (error instanceof PdfExportUserQueueLimitError) {
      return NextResponse.json(
        {
          error: "user_queue_limit",
          limit: getPdfExportQueueConfig().maxActivePerUser,
        },
        { status: 429 },
      );
    }

    throw error;
  }
}
