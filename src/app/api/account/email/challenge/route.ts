import { NextResponse } from "next/server";
import { z } from "zod";

import { issueAccountEmailChallenge } from "@/lib/auth/account/challenges";
import { accountErrorResponse } from "@/lib/auth/account/http";
import { verifyAccountPassword } from "@/lib/auth/account/security";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { sendAccountVerificationCode } from "@/lib/runtime/email";

const challengeSchema = z.object({
  stage: z.enum(["old", "new"]),
  newEmail: z.email().transform((value) => value.trim().toLowerCase()),
  currentPassword: z.string().min(1).max(128),
  locale: z.enum(["zh-CN", "en-US"]).optional().default("zh-CN"),
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = challengeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const purpose = parsed.data.stage === "old"
    ? "change_email_old" as const
    : "change_email_new" as const;
  const email = parsed.data.stage === "old"
    ? session.user.email
    : parsed.data.newEmail;
  const binding = `email-change:${parsed.data.newEmail}`;
  const source = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  try {
    await verifyAccountPassword({
      userId: session.user.id,
      password: parsed.data.currentPassword,
    });
    const challenge = await issueAccountEmailChallenge({
      userId: session.user.id,
      purpose,
      email,
      source,
      binding,
      deliver: ({ code }) =>
        sendAccountVerificationCode({
          email,
          name: session.user.name,
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
