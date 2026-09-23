import { NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import {
  InvitationEmailError,
  InvitationLimitError,
} from "@/lib/invitations/errors";
import {
  createUserInvitation,
  listUserInvitations,
} from "@/lib/invitations/service";
import { sendProductInvitationEmail } from "@/lib/runtime/email";

const bodySchema = z.object({ email: z.email().max(254) }).strict();

export async function GET() {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await listUserInvitations(session.user.id));
}

export async function POST(request: Request) {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    await createUserInvitation({
      inviterUserId: session.user.id,
      inviterName: session.user.name,
      inviterEmail: session.user.email,
      invitedEmail: parsed.data.email,
      deliverInvitation: sendProductInvitationEmail,
    });
    return NextResponse.json({ status: "processed" }, { status: 202 });
  } catch (error) {
    if (error instanceof InvitationLimitError) {
      return NextResponse.json(
        { error: "INVITATION_LIMIT_REACHED" },
        { status: 409 },
      );
    }
    if (error instanceof InvitationEmailError) {
      return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
