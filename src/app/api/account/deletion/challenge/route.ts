import { NextResponse } from "next/server";
import { z } from "zod";

import { isManagementOnlyIdentity } from "@/lib/admin/store";
import { issueAccountEmailChallenge } from "@/lib/auth/account/challenges";
import { AccountSecurityError } from "@/lib/auth/account/errors";
import { accountErrorResponse } from "@/lib/auth/account/http";
import { getAccountLifecycle } from "@/lib/auth/account/repository";
import { verifyAccountPassword } from "@/lib/auth/account/security";
import { getOptionalIdentitySession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { sendAccountVerificationCode } from "@/lib/runtime/email";

const challengeSchema = z.object({
  purpose: z.enum(["delete", "restore"]),
  password: z.string().min(1).max(128),
  locale: z.enum(["zh-CN", "en-US"]).optional().default("zh-CN"),
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const identity = await getOptionalIdentitySession();
  if (!identity || await isManagementOnlyIdentity(identity.user.id)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = challengeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const lifecycle = await getAccountLifecycle(identity.user.id);
    const isRestore = parsed.data.purpose === "restore";
    const now = new Date();
    const lifecycleAllowed = isRestore
      ? lifecycle.status === "pending_deletion" &&
        Boolean(lifecycle.deletionDueAt && lifecycle.deletionDueAt > now)
      : lifecycle.status === "active";
    if (!lifecycleAllowed) {
      throw new AccountSecurityError(
        isRestore ? "recovery_period_ended" : "account_unavailable",
      );
    }

    await verifyAccountPassword({
      userId: identity.user.id,
      password: parsed.data.password,
      allowPendingDeletion: isRestore,
    });
    const purpose = isRestore ? "restore_account" : "delete_account";
    const source = request.headers.get("x-forwarded-for")
      ?.split(",")[0]?.trim() || "unknown";
    const challenge = await issueAccountEmailChallenge({
      userId: identity.user.id,
      purpose,
      email: identity.user.email,
      source,
      now,
      deliver: ({ code }) =>
        sendAccountVerificationCode({
          email: identity.user.email,
          name: identity.user.name,
          code,
          purpose,
          locale: parsed.data.locale,
        }),
    });
    return NextResponse.json(challenge);
  } catch (error) {
    return accountErrorResponse(error);
  }
}
