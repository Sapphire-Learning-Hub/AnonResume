import { NextResponse } from "next/server";
import { z } from "zod";

import { getOptionalSession } from "@/lib/auth/session";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
  RequestBodyTooLargeError,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";
import {
  restoreResumeVersion,
  ResumeNotFoundError,
  ResumeVersionConflictError,
  ResumeVersionSnapshotNotFoundError,
} from "@/lib/resume/repository";

const restoreVersionSchema = z.object({
  version: z.number().int().positive(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; snapshotId: string }> },
) {
  const forbiddenResponse = requireSameOrigin(request);

  if (forbiddenResponse) {
    return forbiddenResponse;
  }

  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id, snapshotId } = await params;

  try {
    const body = restoreVersionSchema.parse(
      await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
    );
    const resume = await restoreResumeVersion({
      userId: session.user.id,
      resumeId: id,
      snapshotId,
      version: body.version,
    });

    return NextResponse.json({ resume });
  } catch (error) {
    if (error instanceof ResumeVersionConflictError) {
      return NextResponse.json(
        { error: "version_conflict", currentVersion: error.currentVersion },
        { status: 409 },
      );
    }

    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "request_payload_too_large" },
        { status: 413 },
      );
    }

    if (
      error instanceof ResumeNotFoundError ||
      error instanceof ResumeVersionSnapshotNotFoundError
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_version" }, { status: 400 });
    }

    throw error;
  }
}
