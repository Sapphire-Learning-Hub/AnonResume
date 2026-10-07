import { NextResponse } from "next/server";
import { z } from "zod";

import { accountErrorResponse } from "@/lib/auth/account/http";
import {
  getAccountProfile,
  updateAccountProfile,
} from "@/lib/auth/account/security";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function GET() {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({
      profile: await getAccountProfile(session.user.id),
    });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = profileSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    return NextResponse.json({
      profile: await updateAccountProfile({
        userId: session.user.id,
        name: parsed.data.name,
      }),
    });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
