import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin/api";
import { listAssignableAdminUsers } from "@/lib/admin/query";
import { parsePageRequest } from "@/lib/shared/pagination";

async function getHandler(request: Request) {
  try {
    await requireAdminApi({ superAdminOnly: true });
    const url = new URL(request.url);
    const result = await listAssignableAdminUsers({
      ...parsePageRequest(Object.fromEntries(url.searchParams)),
      query: url.searchParams.get("q") ?? undefined,
    });

    return NextResponse.json({
      ...result,
      items: result.items.map(({ id, name, email }) => ({
        id,
        label: `${name} · ${email}`,
      })),
    });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export const GET = withRequestLogging("/api/manage/users", getHandler);
