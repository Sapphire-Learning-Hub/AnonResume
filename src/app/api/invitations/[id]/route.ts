import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import { InvitationNotActionableError } from "@/lib/invitations/errors";
import { revokeUserInvitation } from "@/lib/invitations/service";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await revokeUserInvitation({
      inviterUserId: session.user.id,
      invitationId: (await params).id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof InvitationNotActionableError) {
      return NextResponse.json(
        { error: "INVITATION_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
