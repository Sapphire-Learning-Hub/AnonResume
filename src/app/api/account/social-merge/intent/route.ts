import { NextResponse } from "next/server";

import { getAccountMergeErrorStatus, AccountMergeError } from "@/lib/auth/account/merge/errors";
import { ACCOUNT_MERGE_INTENT_COOKIE } from "@/lib/auth/account/merge/link-attempts";
import { getAccountMergeIntentMetadata } from "@/lib/auth/account/merge/service";
import { getOptionalSession } from "@/lib/auth/session";

function readCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function GET(request: Request) {
  const session = await getOptionalSession();
  const rawIntentToken = readCookie(request, ACCOUNT_MERGE_INTENT_COOKIE);
  if (!session || !rawIntentToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getAccountMergeIntentMetadata({
      rawIntentToken,
      userId: session.user.id,
      sessionToken: session.session.token,
    }));
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
