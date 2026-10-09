import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { verifySocialRegistrationEmail } from "@/lib/auth/social-registration/email";
import { getSocialRegistrationErrorStatus, SocialRegistrationError } from "@/lib/auth/social-registration/errors";
import { getSocialRegistrationCookie } from "@/lib/auth/social-registration/http";
import { requireSameOrigin } from "@/lib/http/request-origin";

const inputSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

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
    const result = await verifySocialRegistrationEmail({
      rawToken,
      code: parsed.data.code,
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
