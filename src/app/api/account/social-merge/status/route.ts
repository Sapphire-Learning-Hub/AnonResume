import { NextResponse } from "next/server";

import { AccountMergeError, getAccountMergeErrorStatus } from "@/lib/auth/account/merge/errors";
import {
  ACCOUNT_MERGE_STATUS_COOKIE,
  getAccountMergeOperationStatus,
} from "@/lib/auth/account/merge/service";

function readCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function GET(request: Request) {
  const rawStatusToken = readCookie(request, ACCOUNT_MERGE_STATUS_COOKIE);
  if (!rawStatusToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await getAccountMergeOperationStatus(rawStatusToken);
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
