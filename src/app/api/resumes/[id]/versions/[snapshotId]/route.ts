import { withRequestLogging } from "@/lib/observability/http";
import { withResumeLifecycleErrors } from "@/lib/resume/trash/http";

import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import {
  getResumeVersionSnapshot,
  ResumeVersionSnapshotNotFoundError,
} from "@/lib/resume/repository";

async function getHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string; snapshotId: string }> },
) {
  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id, snapshotId } = await params;

  try {
    const snapshot = await getResumeVersionSnapshot(
      session.user.id,
      id,
      snapshotId,
    );

    return NextResponse.json({ version: snapshot });
  } catch (error) {
    if (error instanceof ResumeVersionSnapshotNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    throw error;
  }
}

export const GET = withRequestLogging("/api/resumes/[id]/versions/[snapshotId]", withResumeLifecycleErrors(getHandler));
