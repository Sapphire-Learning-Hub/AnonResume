import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth-session";
import { PDF_EXPORT_OFFLINE_POLL_MS } from "@/lib/pdf-export-availability";
import {
  cancelPdfExport,
  getPdfExportStatus,
  PdfExportAccessError,
  PdfExportNotFoundError,
} from "@/lib/pdf-export-queue";
import { getBearerToken } from "@/lib/request-authorization";
import { requireSameOrigin } from "@/lib/request-origin";

function getAccess(request: Request, requesterUserId?: string) {
  return {
    requesterUserId,
    accessToken: getBearerToken(request.headers),
  };
}

function handleAccessError(error: unknown) {
  if (error instanceof PdfExportNotFoundError) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (error instanceof PdfExportAccessError) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  throw error;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();
  const { id } = await params;

  try {
    const job = await getPdfExportStatus({
      jobId: id,
      ...getAccess(request, session?.user.id),
    });

    const response = NextResponse.json({ job });

    if (job.pollAfterMs) {
      response.headers.set(
        "Retry-After",
        String(Math.ceil(job.pollAfterMs / 1_000)),
      );
    }

    return response;
  } catch (error) {
    return handleAccessError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);

  if (forbiddenResponse) {
    return forbiddenResponse;
  }

  const session = await getOptionalSession();
  const { id } = await params;
  const access = getAccess(request, session?.user.id);

  try {
    await cancelPdfExport({ jobId: id, ...access });
    const job = await getPdfExportStatus({ jobId: id, ...access });

    const response = NextResponse.json({ job });

    if (job.workerAvailable === false) {
      response.headers.set(
        "Retry-After",
        String(PDF_EXPORT_OFFLINE_POLL_MS / 1_000),
      );
    }

    return response;
  } catch (error) {
    return handleAccessError(error);
  }
}
