import { NextResponse } from "next/server";
import { z } from "zod";

import {
  issueAccountEmailChallenge,
  verifyAccountEmailChallenge,
} from "@/lib/auth/account/challenges";
import { accountErrorResponse } from "@/lib/auth/account/http";
import { verifyAccountPassword } from "@/lib/auth/account/security";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { sendAccountVerificationCode } from "@/lib/runtime/email";

const localeSchema = z.enum(["zh-CN", "en-US"]).optional().default("zh-CN");
const challengeSchema = z.discriminatedUnion("stage", [
  z.object({
    stage: z.literal("old"),
    currentPassword: z.string().min(1).max(128),
    locale: localeSchema,
  }),
  z.object({
    stage: z.literal("new"),
    newEmail: z.email().transform((value) => value.trim().toLowerCase()),
    oldEmailCode: z.string().regex(/^\d{6}$/),
    locale: localeSchema,
  }),
]);
const verificationSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
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

  const source = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  try {
    const purpose = parsed.data.stage === "old"
      ? "change_email_old" as const
      : "change_email_new" as const;
    const email = parsed.data.stage === "old"
      ? session.user.email
      : parsed.data.newEmail;
    const binding = parsed.data.stage === "new"
      ? `email-change:${parsed.data.newEmail}`
      : undefined;
    if (parsed.data.stage === "old") {
      await verifyAccountPassword({
        userId: session.user.id,
        password: parsed.data.currentPassword,
      });
    } else {
      await verifyAccountEmailChallenge({
        userId: session.user.id,
        purpose: "change_email_old",
        email: session.user.email,
        code: parsed.data.oldEmailCode,
      });
    }
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

export async function PUT(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = verificationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    await verifyAccountEmailChallenge({
      userId: session.user.id,
      purpose: "change_email_old",
      email: session.user.email,
      code: parsed.data.code,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
