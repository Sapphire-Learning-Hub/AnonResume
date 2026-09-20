import { NextResponse } from "next/server";
import { z } from "zod";

import {
  claimInstanceSetupCode,
  SetupClaimRateLimitError,
  SetupCodeInvalidError,
} from "@/lib/admin/setup/session";
import {
  getSetupRequestSource,
  getSetupSessionCookieOptions,
  SETUP_SESSION_COOKIE,
} from "@/lib/admin/setup/request";
import { requireSameOrigin } from "@/lib/http/request-origin";

const bodySchema = z.object({
  code: z.string().min(1).max(256),
});

export async function POST(request: Request) {
  const forbidden = requireSameOrigin(request);
  if (forbidden) return forbidden;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const claimed = await claimInstanceSetupCode(
      parsed.data.code,
      getSetupRequestSource(request),
    );
    const response = NextResponse.json(
      {
        mode: claimed.mode,
        expiresAt: claimed.expiresAt.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(
      SETUP_SESSION_COOKIE,
      claimed.rawSessionToken,
      getSetupSessionCookieOptions(claimed.expiresAt),
    );
    return response;
  } catch (error) {
    if (error instanceof SetupClaimRateLimitError) {
      return NextResponse.json(
        { error: error.code },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(error.retryAfterSeconds),
          },
        },
      );
    }
    if (error instanceof SetupCodeInvalidError) {
      return NextResponse.json(
        { error: error.code },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
