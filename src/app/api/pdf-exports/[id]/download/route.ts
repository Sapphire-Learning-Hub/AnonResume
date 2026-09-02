import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth-session";
import { createDownloadContentDisposition } from "@/lib/download-filename";
import {
  getPdfExportDownload,
  PdfExportAccessError,
  PdfExportNotFoundError,
  PdfExportNotReadyError,
} from "@/lib/pdf-export-queue";
import { getBearerToken } from "@/lib/request-authorization";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();
  const { id } = await params;

  try {
    const download = await getPdfExportDownload({
      jobId: id,
      requesterUserId: session?.user.id,
      accessToken: getBearerToken(request.headers),
    });

    return new NextResponse(Uint8Array.from(download.result), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": createDownloadContentDisposition(
          download.filename,
        ),
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    if (error instanceof PdfExportNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (error instanceof PdfExportAccessError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (error instanceof PdfExportNotReadyError) {
      return NextResponse.json({ error: "not_ready" }, { status: 409 });
    }

    throw error;
  }
}
