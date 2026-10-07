import { NextResponse } from "next/server";

import { AccountSecurityError } from "./errors";

export function accountErrorResponse(error: unknown) {
  if (error instanceof AccountSecurityError) {
    const status =
      error.code === "challenge_rate_limited" ||
      error.code === "challenge_resend_too_soon"
        ? 429
        : error.code === "email_in_use"
          ? 409
          : error.code === "session_not_found"
            ? 404
            : error.code === "account_unavailable"
              ? 403
              : 400;
    return NextResponse.json({ error: error.code }, { status });
  }

  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
