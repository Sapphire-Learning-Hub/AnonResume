import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createSocialLinkAttempt,
  SOCIAL_LINK_ATTEMPT_COOKIE,
  SOCIAL_LINK_ATTEMPT_MAX_AGE_SECONDS,
} from "@/lib/auth/account/merge/link-attempts";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";

const inputSchema = z.object({ provider: z.literal("github") });

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const attempt = await createSocialLinkAttempt({
    userId: session.user.id,
    sessionToken: session.session.token,
    providerId: parsed.data.provider,
  });
  const response = NextResponse.json({
    callbackURL:
      "/api/account/social-link/result?provider=github&outcome=success",
    errorCallbackURL:
      "/api/account/social-link/result?provider=github&outcome=error",
  });
  response.cookies.set(SOCIAL_LINK_ATTEMPT_COOKIE, attempt.rawToken, {
    httpOnly: true,
    maxAge: SOCIAL_LINK_ATTEMPT_MAX_AGE_SECONDS,
    path: "/api",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}
