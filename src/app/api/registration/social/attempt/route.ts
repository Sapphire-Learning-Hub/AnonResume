import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSetupAccessDecision } from "@/lib/admin/setup/access";
import { isGitHubAuthEnabled } from "@/lib/auth/config";
import {
  createRegistrationConsentErrorResponse,
  hasRegistrationConsent,
} from "@/lib/auth/registration-consent";
import { getOptionalSession } from "@/lib/auth/session";
import {
  cancelSocialRegistrationAttempt,
  createSocialRegistrationAttempt,
} from "@/lib/auth/social-registration/repository";
import {
  getSocialRegistrationCookie,
  setSocialRegistrationCookie,
} from "@/lib/auth/social-registration/http";
import { requireSameOrigin } from "@/lib/http/request-origin";

const inputSchema = z.object({ provider: z.literal("github") });

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (
    await getSetupAccessDecision(request.nextUrl.pathname) === "require_setup"
  ) {
    return NextResponse.json(
      { error: "instance_setup_required" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!hasRegistrationConsent(request)) {
    return createRegistrationConsentErrorResponse();
  }
  if (await getOptionalSession()) {
    return NextResponse.json(
      { error: "already_authenticated" },
      { status: 409 },
    );
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!(await isGitHubAuthEnabled())) {
    return NextResponse.json(
      { error: "provider_unavailable" },
      { status: 503 },
    );
  }

  const previousToken = getSocialRegistrationCookie(request);
  if (previousToken) {
    await cancelSocialRegistrationAttempt({ rawToken: previousToken });
  }
  const attempt = await createSocialRegistrationAttempt({
    providerId: parsed.data.provider,
  });
  const response = NextResponse.json({
    callbackURL:
      "/api/registration/social/result?provider=github&outcome=success",
    errorCallbackURL:
      "/api/registration/social/result?provider=github&outcome=error",
  }, { headers: { "Cache-Control": "no-store" } });
  setSocialRegistrationCookie(response, request, attempt.rawToken);
  return response;
}
