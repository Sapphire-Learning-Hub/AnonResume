import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth-session";
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

    return NextResponse.json({ job });
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

    return NextResponse.json({ job });
  } catch (error) {
    return handleAccessError(error);
  }
}
