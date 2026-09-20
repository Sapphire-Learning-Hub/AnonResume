import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import { createDownloadContentDisposition } from "@/lib/shared/download-filename";
import {
  getPdfExportDownload,
  getPdfExportQueueConfig,
  PdfExportAccessError,
  PdfExportNotFoundError,
  PdfExportNotReadyError,
} from "@/lib/pdf/export-queue";
import { getBearerToken } from "@/lib/http/request-authorization";
import { getRuntimeConfig } from "@/lib/config/runtime";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();
  const { id } = await params;
  const runtime = await getRuntimeConfig("web");
  const configuration = getPdfExportQueueConfig(runtime.values);

  try {
    const download = await getPdfExportDownload(
      {
        jobId: id,
        requesterUserId: session?.user.id,
        accessToken: getBearerToken(request.headers),
      },
      configuration,
    );

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
