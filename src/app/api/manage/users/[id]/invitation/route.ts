import { NextResponse } from "next/server";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin/api";
import {
  AdminInvitationConflictError,
  AdminInvitationNotFoundError,
  resendUserInvitation,
} from "@/lib/admin/invitations";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireAdminApi({
      superAdminOnly: true,
      recentMfa: true,
    });
    const result = await resendUserInvitation({
      actorUserId: context.userId,
      actorKind: context.kind,
      userId: (await params).id,
    });
    return NextResponse.json(result);
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminInvitationNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (error instanceof AdminInvitationConflictError) {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
