import { NextResponse } from "next/server";
import { z } from "zod";

import { adminApiErrorResponse, requireAdminApi } from "@/lib/admin/api";
import {
  AdminMfaLockedError,
  AdminMfaVerificationError,
  reauthenticateAdminSession,
} from "@/lib/admin/store";

const bodySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  try {
    const context = await requireAdminApi({ allowRecoveryRequired: true });
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    await reauthenticateAdminSession({
      adminSessionId: context.adminSessionId,
      userId: context.userId,
      code: parsed.data.code,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = adminApiErrorResponse(error);
    if (authError) return authError;
    if (error instanceof AdminMfaLockedError) return NextResponse.json({ error: "mfa_locked" }, { status: 423 });
    if (error instanceof AdminMfaVerificationError) return NextResponse.json({ error: "invalid_code" }, { status: 401 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
