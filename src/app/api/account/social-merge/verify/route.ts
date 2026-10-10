import { NextResponse } from "next/server";
import { z } from "zod";

import { AccountMergeError, getAccountMergeErrorStatus } from "@/lib/auth/account/merge/errors";
import { ACCOUNT_MERGE_INTENT_COOKIE } from "@/lib/auth/account/merge/link-attempts";
import {
  ACCOUNT_MERGE_STATUS_COOKIE,
  ACCOUNT_MERGE_STATUS_MAX_AGE_SECONDS,
  verifyAccountMergeIntent,
} from "@/lib/auth/account/merge/service";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";

const inputSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  targetEmail: z.email().max(320),
  targetPassword: z.string().min(1).max(128),
  mfaCode: z.string().min(6).max(32).optional(),
  locale: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
});

function readCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  const rawIntentToken = readCookie(request, ACCOUNT_MERGE_INTENT_COOKIE);
  if (!session || !rawIntentToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const verified = await verifyAccountMergeIntent({
      rawIntentToken,
      userId: session.user.id,
      sessionToken: session.session.token,
      ...parsed.data,
    });
    const { rawStatusToken, ...body } = verified;
    const response = NextResponse.json(body);
    response.cookies.set(ACCOUNT_MERGE_STATUS_COOKIE, rawStatusToken, {
      httpOnly: true,
      maxAge: ACCOUNT_MERGE_STATUS_MAX_AGE_SECONDS,
      path: "/api/account/social-merge",
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
    });
    response.cookies.set(ACCOUNT_MERGE_INTENT_COOKIE, "", {
      maxAge: 0,
      path: "/api",
    });
    return response;
  } catch (error) {
    if (error instanceof AccountMergeError) {
      return NextResponse.json(
        { error: error.code },
        { status: getAccountMergeErrorStatus(error.code) },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
