import { NextResponse } from "next/server";

export const REGISTRATION_CONSENT_HEADER =
  "x-anonresume-registration-consent";

export function hasRegistrationConsent(request: Request) {
  return request.headers.get(REGISTRATION_CONSENT_HEADER) === "true";
}

export function createRegistrationConsentErrorResponse() {
  return NextResponse.json(
    {
      code: "REGISTRATION_CONSENT_REQUIRED",
      message: "Privacy policy and terms consent is required",
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function requiresRegistrationConsent(request: Request) {
  const pathname = new URL(request.url).pathname;

  if (pathname.endsWith("/sign-up/email")) {
    return true;
  }

  if (!pathname.endsWith("/sign-in/social")) {
    return false;
  }

  const body = await request.clone().json().catch(() => null) as {
    requestSignUp?: unknown;
  } | null;
  return body?.requestSignUp === true;
}
