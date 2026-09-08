import { NextResponse } from "next/server";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin-api";
import { adminCancelExport } from "@/lib/admin-management";
import {
  PdfExportNotFoundError,
  PdfExportStateConflictError,
} from "@/lib/pdf-export-queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminApi({
      permission: "exports.cancel",
      recentMfa: true,
    });
    await adminCancelExport(context.userId, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof PdfExportNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (error instanceof PdfExportStateConflictError) {
      return NextResponse.json({ error: "invalid_state" }, { status: 409 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
