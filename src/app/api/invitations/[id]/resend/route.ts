import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import {
  InvitationLimitError,
  InvitationNotActionableError,
  InvitationResendTooSoonError,
} from "@/lib/invitations/errors";
import { resendUserInvitation } from "@/lib/invitations/service";
import { sendProductInvitationEmail } from "@/lib/runtime/email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await resendUserInvitation({
      inviterUserId: session.user.id,
      invitationId: (await params).id,
      inviterName: session.user.name,
      deliverInvitation: sendProductInvitationEmail,
    });
    return NextResponse.json({ status: "processed" }, { status: 202 });
  } catch (error) {
    if (error instanceof InvitationResendTooSoonError) {
      return NextResponse.json(
        {
          error: "INVITATION_RESEND_TOO_SOON",
          nextAllowedAt: error.nextAllowedAt.toISOString(),
        },
        { status: 409 },
      );
    }
    if (error instanceof InvitationLimitError) {
      return NextResponse.json(
        { error: "INVITATION_LIMIT_REACHED" },
        { status: 409 },
      );
    }
    if (error instanceof InvitationNotActionableError) {
      return NextResponse.json(
        { error: "INVITATION_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
