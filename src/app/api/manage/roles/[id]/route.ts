import { NextResponse } from "next/server";
import { z } from "zod";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin/api";
import {
  deleteAdminRole,
  updateAdminRole,
  AdminManagementConflictError,
  AdminManagementNotFoundError,
} from "@/lib/admin/management";
import { ADMIN_PERMISSION_KEYS } from "@/lib/admin/permissions";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).default(""),
  permissions: z.array(z.enum(ADMIN_PERMISSION_KEYS)).max(ADMIN_PERMISSION_KEYS.length),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAdminApi({ superAdminOnly: true, recentMfa: true });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    await updateAdminRole({ actorUserId: context.userId, roleId: (await params).id, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminManagementNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (error instanceof AdminManagementConflictError) return NextResponse.json({ error: "conflict" }, { status: 409 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAdminApi({ superAdminOnly: true, recentMfa: true });
    await deleteAdminRole(context.userId, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminManagementNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (error instanceof AdminManagementConflictError) return NextResponse.json({ error: "conflict" }, { status: 409 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
