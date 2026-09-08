import { NextResponse } from "next/server";
import { z } from "zod";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin-api";
import {
  assignAdminRole,
  removeDelegatedAdmin,
  AdminManagementConflictError,
  AdminManagementNotFoundError,
} from "@/lib/admin-management";

const assignSchema = z.object({ userId: z.string().min(1), roleId: z.uuid() });
const removeSchema = z.object({ userId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const context = await requireAdminApi({ superAdminOnly: true, recentMfa: true });
    const parsed = assignSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    await assignAdminRole({ actorUserId: context.userId, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminManagementNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (error instanceof AdminManagementConflictError) return NextResponse.json({ error: "conflict" }, { status: 409 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireAdminApi({ superAdminOnly: true, recentMfa: true });
    const parsed = removeSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    await removeDelegatedAdmin(context.userId, parsed.data.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminManagementConflictError) return NextResponse.json({ error: "conflict" }, { status: 409 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
