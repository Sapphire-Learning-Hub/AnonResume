import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { completeSocialRegistration } from "@/lib/auth/social-registration/completion";
import {
  getSocialRegistrationErrorStatus,
  SocialRegistrationError,
} from "@/lib/auth/social-registration/errors";
import {
  clearSocialRegistrationCookie,
  getSocialRegistrationCookie,
} from "@/lib/auth/social-registration/http";
import { requireSameOrigin } from "@/lib/http/request-origin";

const inputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const rawToken = getSocialRegistrationCookie(request);
  if (!rawToken) {
    return NextResponse.json({ error: "intent_invalid" }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await completeSocialRegistration({
      rawToken,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
    });
    const response = NextResponse.json({
      status: "created",
      email: result.email,
    }, { headers: { "Cache-Control": "no-store" } });
    clearSocialRegistrationCookie(response);
    return response;
  } catch (error) {
    const code = error instanceof SocialRegistrationError
      ? error.code
      : "intent_invalid";
    return NextResponse.json(
      { error: code },
      {
        status: error instanceof SocialRegistrationError
          ? getSocialRegistrationErrorStatus(error.code)
          : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
