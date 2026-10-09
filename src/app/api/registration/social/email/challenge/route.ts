import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSocialRegistrationErrorStatus, SocialRegistrationError } from "@/lib/auth/social-registration/errors";
import { sendSocialRegistrationEmailChallenge } from "@/lib/auth/social-registration/email";
import { getSocialRegistrationCookie } from "@/lib/auth/social-registration/http";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { sendSocialRegistrationVerificationCode } from "@/lib/runtime/email";

const inputSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  locale: z.enum(["zh-CN", "en-US"]).optional().default("zh-CN"),
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
    const result = await sendSocialRegistrationEmailChallenge({
      rawToken,
      email: parsed.data.email,
      deliver: ({ code }) => sendSocialRegistrationVerificationCode({
        email: parsed.data.email,
        name: "",
        code,
        locale: parsed.data.locale,
      }),
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
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
