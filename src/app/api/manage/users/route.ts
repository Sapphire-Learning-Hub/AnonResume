import { NextResponse } from "next/server";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin-api";
import { listAssignableAdminUsers } from "@/lib/admin-query";
import { parsePageRequest } from "@/lib/pagination";

export async function GET(request: Request) {
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
