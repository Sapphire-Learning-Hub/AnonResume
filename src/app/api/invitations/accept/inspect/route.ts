import { withRequestLogging } from "@/lib/observability/http";

import { NextResponse } from "next/server";

import {
  inspectUserInvitation,
  InvalidUserInvitationError,
} from "@/lib/invitations/acceptance";

async function getHandler(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    return NextResponse.json(await inspectUserInvitation(token));
  } catch (error) {
    if (error instanceof InvalidUserInvitationError) {
      return NextResponse.json(
        { error: "INVALID_INVITATION" },
        { status: 410 },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export const GET = withRequestLogging("/api/invitations/accept/inspect", getHandler);
