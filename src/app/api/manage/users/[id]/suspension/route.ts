import { NextResponse } from "next/server";
import { z } from "zod";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin/api";
import {
  AdminManagementConflictError,
  AdminManagementNotFoundError,
  restoreUser,
  suspendUser,
} from "@/lib/admin/management";

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(240),
  suspendedUntil: z.iso.datetime().nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAdminApi({ permission: "users.suspend", recentMfa: true });
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    await suspendUser({
      actorUserId: context.userId,
      userId: (await params).id,
      reason: parsed.data.reason,
      suspendedUntil: parsed.data.suspendedUntil ? new Date(parsed.data.suspendedUntil) : null,
    });
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
    const context = await requireAdminApi({ permission: "users.suspend", recentMfa: true });
    await restoreUser(context.userId, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminManagementNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (error instanceof AdminManagementConflictError) {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
