import { NextResponse } from "next/server";

import { getRequestLocale } from "@/i18n/server";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import { restartEditorOnboarding } from "@/lib/onboarding/service";

export async function POST(request: Request) {
  const forbiddenResponse = requireSameOrigin(request);
  if (forbiddenResponse) return forbiddenResponse;

  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const run = await restartEditorOnboarding({
    userId: session.user.id,
    locale: await getRequestLocale(),
  });

  return NextResponse.json({
    run,
    editorHref: `/app/resumes/${run.resumeId}`,
  });
}
