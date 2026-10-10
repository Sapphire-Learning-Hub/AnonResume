import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import {
  cancelSocialRegistrationAttempt,
  findSocialRegistrationConflict,
  inspectSocialRegistrationIntent,
} from "@/lib/auth/social-registration/repository";
import {
  clearSocialRegistrationCookie,
  getSocialRegistrationCookie,
} from "@/lib/auth/social-registration/http";
import { createApplicationUrl } from "@/lib/http/request-origin";

const expectedRegistrationErrors = new Set([
  "account_not_linked",
  "signup_disabled",
]);

function redirect(request: NextRequest, path: string) {
  return NextResponse.redirect(createApplicationUrl(path, request));
}

async function fail(
  request: NextRequest,
  rawToken: string | undefined,
  code: string,
) {
  if (rawToken) {
    await cancelSocialRegistrationAttempt({ rawToken }).catch(() => false);
  }
  const response = redirect(
    request,
    `/sign-in?error=${encodeURIComponent(code)}`,
  );
  clearSocialRegistrationCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  const rawToken = getSocialRegistrationCookie(request);
  const provider = request.nextUrl.searchParams.get("provider");
  const outcome = request.nextUrl.searchParams.get("outcome");
  if (
    !rawToken ||
    provider !== "github" ||
    (outcome !== "success" && outcome !== "error")
  ) {
    return fail(request, rawToken, "social_registration_invalid");
  }

  if (await getOptionalSession()) {
    await cancelSocialRegistrationAttempt({ rawToken }).catch(() => false);
    const response = redirect(request, "/app");
    clearSocialRegistrationCookie(response);
    return response;
  }

  const errorCode = request.nextUrl.searchParams.get("error");
  if (
    outcome === "error" &&
    (!errorCode || !expectedRegistrationErrors.has(errorCode))
  ) {
    return fail(request, rawToken, errorCode === "access_denied"
      ? "social_oauth_cancelled"
      : "social_oauth_failed");
  }

  try {
    await inspectSocialRegistrationIntent({ rawToken });
    const conflict = await findSocialRegistrationConflict({ rawToken });
    if (conflict) {
      return fail(
        request,
        rawToken,
        "social_registration_account_exists",
      );
    }
    return redirect(request, "/social-registration");
  } catch {
    return fail(request, rawToken, "social_registration_invalid");
  }
}
