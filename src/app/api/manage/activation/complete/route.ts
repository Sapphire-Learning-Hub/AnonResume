import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AdminActivationError,
  completeAdminActivation,
} from "@/lib/admin-activation";
import {
  AdminMfaLockedError,
  AdminMfaVerificationError,
} from "@/lib/admin-store";

const bodySchema = z.object({
  token: z.string().min(32).max(256),
  deviceId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    return NextResponse.json(await completeAdminActivation(parsed.data));
  } catch (error) {
    if (error instanceof AdminMfaLockedError) {
      return NextResponse.json(
        { error: "mfa_locked", lockedUntil: error.lockedUntil.toISOString() },
        { status: 423 },
      );
    }
    const expected =
      error instanceof AdminActivationError ||
      error instanceof AdminMfaVerificationError;
    return NextResponse.json(
      { error: expected ? "activation_invalid" : "internal_error" },
      { status: expected ? 400 : 500 },
    );
  }
}
