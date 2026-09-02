import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth-session";
import { requireSameOrigin } from "@/lib/request-origin";
import {
  deleteResumeRecord,
  getResumeRecord,
  ResumeNotFoundError,
} from "@/lib/resume-repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);

  if (forbiddenResponse) {
    return forbiddenResponse;
  }

  const session = await requireSession();
  const { id } = await params;
  const resume = await getResumeRecord(session.user.id, id);

  if (!resume) {
    throw new ResumeNotFoundError(id);
  }

  await deleteResumeRecord(session.user.id, id);

  return NextResponse.redirect(new URL("/app", request.url), { status: 303 });
}
