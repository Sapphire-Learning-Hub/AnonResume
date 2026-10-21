import { withRequestLogging } from "@/lib/observability/http";
import { withResumeLifecycleErrors } from "@/lib/resume/trash/http";
import { z } from "zod";
import {
  parseLimitedJsonRequest,
  RequestBodyTooLargeError,
} from "@/lib/http/request-body";

import { NextResponse } from "next/server";

import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import {
  paginateResumeVersionSnapshots,
  getAutosaveSnapshot,
  ResumeNotFoundError,
  snapshotResumeVersion,
} from "@/lib/resume/repository";
import { parsePageRequest } from "@/lib/shared/pagination";

function toVersionSummary(
  snapshot: Awaited<ReturnType<typeof snapshotResumeVersion>>,
) {
  return {
    id: snapshot.id,
    version: snapshot.version,
    createdAt: snapshot.createdAt,
    kind: snapshot.kind,
  };
}

async function getHandler(
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
    autosave: await getAutosaveSnapshot(session.user.id, id).then((point) =>
      point ? toVersionSummary(point) : null,
    ),
  });
}

async function postHandler(
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
    const body = request.body
      ? z
          .object({ sourceSnapshotId: z.string().uuid().optional() })
          .strict()
          .parse(await parseLimitedJsonRequest(request))
      : {};
    const snapshot = await snapshotResumeVersion(
      session.user.id,
      id,
      body.sourceSnapshotId,
    );

    return NextResponse.json(
      { version: toVersionSummary(snapshot) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    if (error instanceof SyntaxError || error instanceof z.ZodError)
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    if (error instanceof ResumeNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    throw error;
  }
}

export const GET = withRequestLogging(
  "/api/resumes/[id]/versions",
  withResumeLifecycleErrors(getHandler),
);
export const POST = withRequestLogging(
  "/api/resumes/[id]/versions",
  withResumeLifecycleErrors(postHandler),
);
