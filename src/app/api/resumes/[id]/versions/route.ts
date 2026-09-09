import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth-session";
import { requireSameOrigin } from "@/lib/request-origin";
import {
  paginateResumeVersionSnapshots,
  ResumeNotFoundError,
  snapshotResumeVersion,
} from "@/lib/resume-repository";
import { parsePageRequest } from "@/lib/pagination";

function toVersionSummary(snapshot: Awaited<ReturnType<typeof snapshotResumeVersion>>) {
  return {
    id: snapshot.id,
    version: snapshot.version,
    createdAt: snapshot.createdAt,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const pageRequest = parsePageRequest(
    Object.fromEntries(url.searchParams.entries()),
  );
  const result = await paginateResumeVersionSnapshots({
    userId: session.user.id,
    resumeId: id,
    ...pageRequest,
  });

  return NextResponse.json({
    ...result,
    items: result.items.map(toVersionSummary),
  });
}

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
    const snapshot = await snapshotResumeVersion(session.user.id, id);

    return NextResponse.json(
      { version: toVersionSummary(snapshot) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ResumeNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    throw error;
  }
}
