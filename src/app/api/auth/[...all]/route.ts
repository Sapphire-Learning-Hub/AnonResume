import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSetupAccessDecision } from "@/lib/admin/setup/access";
import { isPasswordResetAllowedForToken } from "@/lib/auth/account/security";
import { getAuth } from "@/lib/auth/config";
import {
  hasRegistrationConsent,
  requiresRegistrationConsent,
} from "@/lib/auth/registration-consent";

export async function GET(request: NextRequest) {
  const blocked = await blockAuthDuringInitialSetup(request);
  if (blocked) return blocked;
  return toNextJsHandler(await getAuth()).GET(request);
}

export async function POST(request: NextRequest) {
  const blocked = await blockAuthDuringInitialSetup(request);
  if (blocked) return blocked;
  const missingConsent = await blockRegistrationWithoutConsent(request);
  if (missingConsent) return missingConsent;
  const inactiveReset = await blockInactivePasswordReset(request);
  if (inactiveReset) return inactiveReset;
  return toNextJsHandler(await getAuth()).POST(request);
}

async function blockRegistrationWithoutConsent(request: NextRequest) {
  if (
    !(await requiresRegistrationConsent(request)) ||
    hasRegistrationConsent(request)
  ) {
    return null;
  }

  return NextResponse.json(
    {
      code: "REGISTRATION_CONSENT_REQUIRED",
      message: "Privacy policy and terms consent is required",
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
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
