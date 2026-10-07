import { NextResponse } from "next/server";
import { z } from "zod";

import { accountErrorResponse } from "@/lib/auth/account/http";
import {
  listAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
} from "@/lib/auth/account/security";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";

const revokeSchema = z.object({
  sessionId: z.string().min(1).max(200),
});

export async function GET() {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({
      sessions: await listAccountSessions({
        userId: session.user.id,
        currentSessionId: session.session.id,
      }),
    });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = revokeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    await revokeAccountSession({
      userId: session.user.id,
      currentSessionId: session.session.id,
      sessionId: parsed.data.sessionId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await revokeOtherAccountSessions({
      userId: session.user.id,
      currentSessionToken: session.session.token,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
