import { NextResponse } from "next/server";
import { z } from "zod";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin/api";
import {
  AdminInvitationConflictError,
  AdminInvitationNotFoundError,
  inviteUser,
} from "@/lib/admin/invitations";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  roleIds: z.array(z.uuid()).min(1).max(50),
});

export async function POST(request: Request) {
  try {
    const context = await requireAdminApi({
      superAdminOnly: true,
      recentMfa: true,
    });
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const result = await inviteUser({
      actorUserId: context.userId,
      actorKind: context.kind,
      ...parsed.data,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminInvitationConflictError) {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    if (error instanceof AdminInvitationNotFoundError) {
      return NextResponse.json({ error: "role_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
