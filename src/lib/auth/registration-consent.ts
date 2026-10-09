export const REGISTRATION_CONSENT_HEADER =
  "x-anonresume-registration-consent";

export function hasRegistrationConsent(request: Request) {
  return request.headers.get(REGISTRATION_CONSENT_HEADER) === "true";
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
