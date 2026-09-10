import { NextResponse } from "next/server";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin/api";
import {
  AdminManagementConflictError,
  AdminManagementNotFoundError,
  revokeUserSessions,
} from "@/lib/admin/management";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAdminApi({ permission: "users.sessions.revoke", recentMfa: true });
    await revokeUserSessions(context.userId, (await params).id);
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
