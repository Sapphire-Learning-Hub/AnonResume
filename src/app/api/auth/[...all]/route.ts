import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSetupAccessDecision } from "@/lib/admin/setup/access";
import { isPasswordResetAllowedForToken } from "@/lib/auth/account/security";
import {
  createSocialLinkResultProof,
  SOCIAL_LINK_ATTEMPT_COOKIE,
  SOCIAL_LINK_RESULT_PROOF_COOKIE,
} from "@/lib/auth/account/merge/link-attempts";
import { getAuth } from "@/lib/auth/config";
import { assertAccountMergeMutationAllowed } from "@/lib/auth/account/merge/executor";
import { AccountMergeError } from "@/lib/auth/account/merge/errors";
import { getOptionalSession } from "@/lib/auth/session";
import {
  createRegistrationConsentErrorResponse,
  hasRegistrationConsent,
  requiresRegistrationConsent,
} from "@/lib/auth/registration-consent";

export async function GET(request: NextRequest) {
  const blocked = await blockAuthDuringInitialSetup(request);
  if (blocked) return blocked;
  const mergeBlocked = await blockSocialMutationDuringMerge(request);
  if (mergeBlocked) return mergeBlocked;
  const response = await toNextJsHandler(await getAuth()).GET(request);
  return attachSocialLinkResultProof(request, response);
}

export async function POST(request: NextRequest) {
  const blocked = await blockAuthDuringInitialSetup(request);
  if (blocked) return blocked;
  const missingConsent = await blockRegistrationWithoutConsent(request);
  if (missingConsent) return missingConsent;
  const inactiveReset = await blockInactivePasswordReset(request);
  if (inactiveReset) return inactiveReset;
  const mergeBlocked = await blockSocialMutationDuringMerge(request);
  if (mergeBlocked) return mergeBlocked;
  return toNextJsHandler(await getAuth()).POST(request);
}

async function blockSocialMutationDuringMerge(request: NextRequest) {
  const endpoint = new URL(request.url).pathname.split("/").at(-1);
  if (
    endpoint !== "link-social" &&
    endpoint !== "unlink-account" &&
    endpoint !== "github"
  ) {
    return null;
  }
  const session = await getOptionalSession();
  if (!session) return null;
  try {
    await assertAccountMergeMutationAllowed(session.user.id);
    return null;
  } catch (error) {
    if (error instanceof AccountMergeError && error.code === "merge_in_progress") {
      return NextResponse.json({ error: error.code }, { status: 409 });
    }
    throw error;
  }
}

async function blockRegistrationWithoutConsent(request: NextRequest) {
  if (
    !(await requiresRegistrationConsent(request)) ||
    hasRegistrationConsent(request)
  ) {
    return null;
  }

  return createRegistrationConsentErrorResponse();
}

async function blockInactivePasswordReset(request: NextRequest) {
  const url = new URL(request.url);
  if (url.pathname.split("/").at(-1) !== "reset-password") return null;

  const body = await request.clone().json().catch(() => null) as {
    token?: unknown;
  } | null;
  const token = typeof body?.token === "string"
    ? body.token
    : url.searchParams.get("token");
  if (!token || await isPasswordResetAllowedForToken(token)) return null;

  return NextResponse.json(
    { code: "INVALID_TOKEN", message: "Invalid token" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

async function blockAuthDuringInitialSetup(request: NextRequest) {
  const decision = await getSetupAccessDecision(new URL(request.url).pathname);
  if (decision === "require_setup") {
    return NextResponse.json(
      { error: "instance_setup_required" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

function attachSocialLinkResultProof(
  request: NextRequest,
  response: Response,
) {
  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.endsWith("/callback/github")) return response;
  const location = response.headers.get("location");
  const rawToken = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === SOCIAL_LINK_ATTEMPT_COOKIE)
    ?.slice(1)
    .join("=");
  if (!location || !rawToken) return response;

  const target = new URL(location, request.url);
  const errorCode = target.searchParams.get("error");
  if (
    target.pathname !== "/api/account/social-link/result" ||
    errorCode !== "account_already_linked_to_different_user"
  ) {
    return response;
  }

  const wrapped = new NextResponse(response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
  wrapped.cookies.set(
    SOCIAL_LINK_RESULT_PROOF_COOKIE,
    createSocialLinkResultProof(rawToken, errorCode),
    {
      httpOnly: true,
      maxAge: 120,
      path: "/api/account/social-link",
      sameSite: "lax",
      secure: requestUrl.protocol === "https:",
    },
  );
  return wrapped;
}
