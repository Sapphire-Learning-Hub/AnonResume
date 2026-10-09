import { NextResponse } from "next/server";
import { z } from "zod";

import { AccountMergeError, getAccountMergeErrorStatus } from "@/lib/auth/account/merge/errors";
import {
  ACCOUNT_MERGE_STATUS_COOKIE,
  confirmVerifiedAccountMerge,
} from "@/lib/auth/account/merge/service";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";

const inputSchema = z.object({
  primaryChoice: z.enum(["current", "target"]),
});

function readCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  const rawStatusToken = readCookie(request, ACCOUNT_MERGE_STATUS_COOKIE);
  if (!session || !rawStatusToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const result = await confirmVerifiedAccountMerge({
      rawStatusToken,
      userId: session.user.id,
      primaryChoice: parsed.data.primaryChoice,
    });
    const response = NextResponse.json(result);
    if (["completed", "failed", "expired", "cancelled"].includes(result.state)) {
      response.cookies.set(ACCOUNT_MERGE_STATUS_COOKIE, "", {
        maxAge: 0,
        path: "/api/account/social-merge",
      });
    }
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
