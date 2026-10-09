import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SocialRegistrationError, getSocialRegistrationErrorStatus } from "@/lib/auth/social-registration/errors";
import {
  clearSocialRegistrationCookie,
  getSocialRegistrationCookie,
} from "@/lib/auth/social-registration/http";
import { inspectSocialRegistrationIntent } from "@/lib/auth/social-registration/repository";

export async function GET(request: NextRequest) {
  const rawToken = getSocialRegistrationCookie(request);
  if (!rawToken) {
    return NextResponse.json(
      { error: "intent_invalid" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const intent = await inspectSocialRegistrationIntent({ rawToken });
    return NextResponse.json(intent, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof SocialRegistrationError
      ? error.code
      : "intent_invalid";
    const response = NextResponse.json(
      { error: code },
      {
        status: error instanceof SocialRegistrationError
          ? getSocialRegistrationErrorStatus(error.code)
          : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
    clearSocialRegistrationCookie(response);
    return response;
  }
}
