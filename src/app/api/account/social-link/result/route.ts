import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  ACCOUNT_MERGE_INTENT_COOKIE,
  resolveSocialLinkAttempt,
  SOCIAL_LINK_ATTEMPT_COOKIE,
  SOCIAL_LINK_ATTEMPT_MAX_AGE_SECONDS,
  SOCIAL_LINK_RESULT_PROOF_COOKIE,
  verifySocialLinkResultProof,
} from "@/lib/auth/account/merge/link-attempts";
import { getOptionalSession } from "@/lib/auth/session";
import { createApplicationUrl } from "@/lib/http/request-origin";

function accountRedirect(request: NextRequest, query: string) {
  return NextResponse.redirect(
    createApplicationUrl(
      `/app/account?section=connections&${query}`,
      request,
    ),
  );
}

function clearCallbackCookies(response: NextResponse) {
  response.cookies.set(SOCIAL_LINK_ATTEMPT_COOKIE, "", {
    maxAge: 0,
    path: "/api",
  });
  response.cookies.set(SOCIAL_LINK_RESULT_PROOF_COOKIE, "", {
    maxAge: 0,
    path: "/api/account/social-link",
  });
}

export async function GET(request: NextRequest) {
  const session = await getOptionalSession();
  const rawToken = request.cookies.get(SOCIAL_LINK_ATTEMPT_COOKIE)?.value;
  const providerId = request.nextUrl.searchParams.get("provider");
  const outcome = request.nextUrl.searchParams.get("outcome");
  if (
    !session ||
    !rawToken ||
    providerId !== "github" ||
    (outcome !== "success" && outcome !== "error")
  ) {
    return accountRedirect(request, "linkError=github");
  }

  const errorCode = request.nextUrl.searchParams.get("error") ?? undefined;
  const proof = request.cookies.get(SOCIAL_LINK_RESULT_PROOF_COOKIE)?.value;
  const collisionProofValid = Boolean(
    proof && errorCode && verifySocialLinkResultProof({
      rawToken,
      errorCode,
      proof,
    }),
  );

  try {
    const result = await resolveSocialLinkAttempt({
      rawToken,
      userId: session.user.id,
      sessionToken: session.session.token,
      providerId,
      outcome,
      errorCode,
      collisionProofValid,
    });
    const response = result.kind === "linked"
      ? accountRedirect(request, "linked=github")
      : result.kind === "collision"
        ? accountRedirect(request, "merge=github")
        : accountRedirect(request, "linkError=github");
    clearCallbackCookies(response);
    if (result.kind === "collision") {
      response.cookies.set(
        ACCOUNT_MERGE_INTENT_COOKIE,
        result.rawIntentToken,
        {
          httpOnly: true,
          maxAge: SOCIAL_LINK_ATTEMPT_MAX_AGE_SECONDS,
          path: "/api",
          sameSite: "lax",
          secure: request.nextUrl.protocol === "https:",
        },
      );
    }
    return response;
  } catch {
    const response = accountRedirect(request, "linkError=github");
    clearCallbackCookies(response);
    return response;
  }
}
