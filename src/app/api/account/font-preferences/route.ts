import { NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import {
  InvalidFontPresetError,
  listUserFontPreferences,
  setUserFontFavorite,
} from "@/lib/resume/fonts/preferences";

const updateSchema = z.object({
  fontPresetId: z.string().min(1).max(100),
  favorite: z.boolean(),
});

export async function GET() {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    preferences: await listUserFontPreferences(session.user.id),
  });
}

export async function PATCH(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    return NextResponse.json({
      preferences: await setUserFontFavorite({
        userId: session.user.id,
        ...parsed.data,
      }),
    });
  } catch (error) {
    if (error instanceof InvalidFontPresetError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
