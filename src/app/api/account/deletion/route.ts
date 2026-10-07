import { NextResponse } from "next/server";
import { z } from "zod";

import { isManagementOnlyIdentity } from "@/lib/admin/store";
import { submitAccountDeletion } from "@/lib/auth/account/deletion";
import { accountErrorResponse } from "@/lib/auth/account/http";
import { getAccountLifecycle } from "@/lib/auth/account/repository";
import {
  getOptionalIdentitySession,
  getOptionalSession,
} from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { sendAccountSecurityNotice } from "@/lib/runtime/email";

const deletionSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/),
  locale: z.enum(["zh-CN", "en-US"]).optional().default("zh-CN"),
});

async function getProductIdentity() {
  const identity = await getOptionalIdentitySession();
  if (!identity || await isManagementOnlyIdentity(identity.user.id)) {
    return null;
  }
  return identity;
}

export async function GET() {
  const identity = await getProductIdentity();
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const lifecycle = await getAccountLifecycle(identity.user.id);
  if (lifecycle.status === "deleted") {
    return NextResponse.json({ error: "account_unavailable" }, { status: 403 });
  }
  return NextResponse.json({ lifecycle });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = deletionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await submitAccountDeletion({
      userId: session.user.id,
      currentSessionToken: session.session.token,
      password: parsed.data.password,
      code: parsed.data.code,
      notify: ({ email, name }) =>
        sendAccountSecurityNotice({
          email,
          name,
          event: "deletion_requested",
          locale: parsed.data.locale,
        }),
    });
    return NextResponse.json(result);
  } catch (error) {
    return accountErrorResponse(error);
  }
}
