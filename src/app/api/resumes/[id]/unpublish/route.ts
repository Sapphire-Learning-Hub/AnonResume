import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth-session";
import { requireSameOrigin } from "@/lib/request-origin";
import {
  ResumeNotFoundError,
  unpublishResumeRecord,
} from "@/lib/resume-repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);

  if (forbiddenResponse) {
    return forbiddenResponse;
  }

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const resume = await unpublishResumeRecord(session.user.id, id);

    return NextResponse.json({ resume });
  } catch (error) {
    if (error instanceof ResumeNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    throw error;
  }
}
