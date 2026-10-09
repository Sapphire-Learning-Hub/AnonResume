import type { NextRequest, NextResponse } from "next/server";

import {
  SOCIAL_REGISTRATION_ATTEMPT_COOKIE,
  SOCIAL_REGISTRATION_MAX_AGE_SECONDS,
} from "./repository";

export function getSocialRegistrationCookie(request: NextRequest) {
  return request.cookies.get(SOCIAL_REGISTRATION_ATTEMPT_COOKIE)?.value;
}

export function setSocialRegistrationCookie(
  response: NextResponse,
  request: NextRequest,
  rawToken: string,
) {
  response.cookies.set(SOCIAL_REGISTRATION_ATTEMPT_COOKIE, rawToken, {
    httpOnly: true,
    maxAge: SOCIAL_REGISTRATION_MAX_AGE_SECONDS,
    path: "/api",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
}

export function clearSocialRegistrationCookie(response: NextResponse) {
  response.cookies.set(SOCIAL_REGISTRATION_ATTEMPT_COOKIE, "", {
    maxAge: 0,
    path: "/api",
  });
}
