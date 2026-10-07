import { NextResponse } from "next/server";

import { isManagementOnlyIdentity } from "@/lib/admin/store";
import { streamAccountExport } from "@/lib/auth/account/export-workbook";
import { getAccountLifecycle } from "@/lib/auth/account/repository";
import { getOptionalIdentitySession } from "@/lib/auth/session";
import { createDownloadContentDisposition } from "@/lib/shared/download-filename";

export async function GET(request: Request) {
  const identity = await getOptionalIdentitySession();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [managementOnly, lifecycle] = await Promise.all([
    isManagementOnlyIdentity(identity.user.id),
    getAccountLifecycle(identity.user.id),
  ]);
  if (managementOnly || lifecycle.status === "deleted") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const locale = new URL(request.url).searchParams.get("locale") === "en-US"
    ? "en-US"
    : "zh-CN";
  const stream = await streamAccountExport(identity.user.id, locale);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": createDownloadContentDisposition(
        `AnonResume-account-data-${date}.xlsx`,
      ),
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
