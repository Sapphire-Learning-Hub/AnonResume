import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createAdminTranslator,
  getAdminSystemRolePresentation,
} from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";
import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin-api";
import { createAdminRole, AdminManagementConflictError } from "@/lib/admin-management";
import { ADMIN_PERMISSION_KEYS } from "@/lib/admin-permissions";
import { listAdminRoles } from "@/lib/admin-query";
import { parsePageRequest } from "@/lib/pagination";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).default(""),
  permissions: z.array(z.enum(ADMIN_PERMISSION_KEYS)).max(ADMIN_PERMISSION_KEYS.length),
});

export async function GET(request: Request) {
  try {
    await requireAdminApi({ superAdminOnly: true });
    const url = new URL(request.url);
    const result = await listAdminRoles({
      ...parsePageRequest(Object.fromEntries(url.searchParams)),
      query: url.searchParams.get("q") ?? undefined,
    });
    const t = createAdminTranslator(await getRequestLocale());

    return NextResponse.json({
      ...result,
      items: result.items.map(({ id, name, permissions, systemKey }) => {
        const systemName = systemKey
          ? getAdminSystemRolePresentation(t, systemKey).name
          : null;

        return {
          id,
          label: systemName
            ? t("roles.systemOption", { name: systemName })
            : name,
          permissions,
        };
      }),
    });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAdminApi({ superAdminOnly: true, recentMfa: true });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    return NextResponse.json(await createAdminRole({ actorUserId: context.userId, ...parsed.data }), { status: 201 });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminManagementConflictError) return NextResponse.json({ error: "conflict" }, { status: 409 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
