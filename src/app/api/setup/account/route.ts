import { NextResponse } from "next/server";
import { z } from "zod";

import {
  beginInstanceSetupAccount,
  SetupCompletionError,
  SetupDuplicateEmailError,
  SetupInvalidPasswordError,
} from "@/lib/admin/setup/completion";
import { requireInstanceSetupSession, SetupSessionInvalidError } from "@/lib/admin/setup/session";
import { requireSameOrigin } from "@/lib/http/request-origin";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email(),
  password: z.string().min(12).max(128),
  deviceName: z.string().trim().min(1).max(60),
});

export async function POST(request: Request) {
  const forbidden = requireSameOrigin(request);
  if (forbidden) return forbidden;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("invalid_request", 400);

  try {
    const session = await requireInstanceSetupSession(request);
    return NextResponse.json(
      await beginInstanceSetupAccount({ session, ...parsed.data }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SetupSessionInvalidError) {
      return errorResponse(error.code, 401);
    }
    if (error instanceof SetupDuplicateEmailError) {
      return errorResponse(error.code, 409);
    }
    if (error instanceof SetupInvalidPasswordError) {
      return errorResponse(error.code, 400);
    }
    if (error instanceof SetupCompletionError) {
      return errorResponse(error.code, 400);
    }
    return errorResponse("internal_error", 500);
  }
}

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
