import { NextResponse } from "next/server";
import { z } from "zod";

import {
  completeInstanceSetup,
  SetupAlreadyCompletedError,
  SetupCompletionError,
  SetupDuplicateEmailError,
  SetupInvalidPasswordError,
  SetupMfaLockedError,
  SetupMfaVerificationError,
} from "@/lib/admin/setup/completion";
import {
  getSetupSessionClearCookieOptions,
  SETUP_SESSION_COOKIE,
} from "@/lib/admin/setup/request";
import { requireInstanceSetupSession, SetupSessionInvalidError } from "@/lib/admin/setup/session";
import { AdminMfaLockedError, AdminMfaVerificationError } from "@/lib/admin/store";
import { requireSameOrigin } from "@/lib/http/request-origin";

const bodySchema = z.object({
  deviceId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const forbidden = requireSameOrigin(request);
  if (forbidden) return forbidden;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("invalid_request", 400);

  try {
    const session = await requireInstanceSetupSession(request);
    const completed = await completeInstanceSetup({
      session,
      ...parsed.data,
    });
    const response = NextResponse.json(completed, {
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(
      SETUP_SESSION_COOKIE,
      "",
      getSetupSessionClearCookieOptions(),
    );
    return response;
  } catch (error) {
    if (error instanceof SetupSessionInvalidError) {
      return errorResponse(error.code, 401);
    }
    if (error instanceof SetupDuplicateEmailError) {
      return errorResponse(error.code, 409);
    }
    if (error instanceof SetupInvalidPasswordError) {
      return errorResponse(error.code, 400);
    }
    if (error instanceof SetupAlreadyCompletedError) {
      return errorResponse(error.code, 409);
    }
    if (
      error instanceof SetupMfaVerificationError ||
      error instanceof AdminMfaVerificationError
    ) {
      return errorResponse("setup_mfa_invalid", 400);
    }
    if (error instanceof SetupMfaLockedError) {
      return errorResponse(error.code, 423, error.lockedUntil);
    }
    if (error instanceof AdminMfaLockedError) {
      return errorResponse("setup_mfa_locked", 423, error.lockedUntil);
    }
    if (error instanceof SetupCompletionError) {
      return errorResponse(error.code, 400);
    }
    return errorResponse("internal_error", 500);
  }
}

function errorResponse(error: string, status: number, lockedUntil?: Date) {
  return NextResponse.json(
    {
      error,
      ...(lockedUntil ? { lockedUntil: lockedUntil.toISOString() } : {}),
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
