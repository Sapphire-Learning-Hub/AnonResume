import { NextResponse } from "next/server";
import { z } from "zod";

import { accountErrorResponse } from "@/lib/auth/account/http";
import { changeAccountEmail } from "@/lib/auth/account/security";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { sendAccountSecurityNotice } from "@/lib/runtime/email";

const emailSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newEmail: z.email().transform((value) => value.trim().toLowerCase()),
  oldEmailCode: z.string().regex(/^\d{6}$/),
  newEmailCode: z.string().regex(/^\d{6}$/),
  locale: z.enum(["zh-CN", "en-US"]).optional().default("zh-CN"),
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = emailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    await changeAccountEmail({
      userId: session.user.id,
      currentSessionToken: session.session.token,
      currentPassword: parsed.data.currentPassword,
      newEmail: parsed.data.newEmail,
      oldEmailCode: parsed.data.oldEmailCode,
      newEmailCode: parsed.data.newEmailCode,
      notifyOldAddress: ({ email, name, newEmail }) =>
        sendAccountSecurityNotice({
          email,
          name,
          event: "email_changed",
          newEmail,
          locale: parsed.data.locale,
        }),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
