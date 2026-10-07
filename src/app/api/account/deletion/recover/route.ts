import { NextResponse } from "next/server";
import { z } from "zod";

import { isManagementOnlyIdentity } from "@/lib/admin/store";
import { restoreAccountDeletion } from "@/lib/auth/account/deletion";
import { accountErrorResponse } from "@/lib/auth/account/http";
import { getOptionalIdentitySession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { sendAccountSecurityNotice } from "@/lib/runtime/email";

const recoverySchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/),
  locale: z.enum(["zh-CN", "en-US"]).optional().default("zh-CN"),
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const identity = await getOptionalIdentitySession();
  if (!identity || await isManagementOnlyIdentity(identity.user.id)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = recoverySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    await restoreAccountDeletion({
      userId: identity.user.id,
      currentSessionToken: identity.session.token,
      password: parsed.data.password,
      code: parsed.data.code,
      notify: ({ email, name }) =>
        sendAccountSecurityNotice({
          email,
          name,
          event: "account_restored",
          locale: parsed.data.locale,
        }),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
