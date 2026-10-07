import { NextResponse } from "next/server";
import { z } from "zod";

import { accountErrorResponse } from "@/lib/auth/account/http";
import { changeAccountPassword } from "@/lib/auth/account/security";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { sendAccountSecurityNotice } from "@/lib/runtime/email";

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
  locale: z.enum(["zh-CN", "en-US"]).optional().default("zh-CN"),
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = passwordSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    await changeAccountPassword({
      userId: session.user.id,
      currentSessionToken: session.session.token,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      notify: ({ email, name }) =>
        sendAccountSecurityNotice({
          email,
          name,
          event: "password_changed",
          locale: parsed.data.locale,
        }),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
