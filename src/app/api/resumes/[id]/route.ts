import { NextResponse } from "next/server";
import { z } from "zod";

import {
  isResumeStructureValidationError,
  ResumeDocumentValidationError,
} from "@/domain/resume/validation";
import { getOptionalSession } from "@/lib/auth/session";
import {
  parseLimitedJsonRequest,
  RequestBodyTooLargeError,
} from "@/lib/http/request-body";
import { requireSameOrigin } from "@/lib/http/request-origin";
import {
  getResumeRecord,
  ResumeNotFoundError,
  ResumeVersionConflictError,
  saveResumeRecord,
} from "@/lib/resume/repository";

const updateResumeSchema = z.object({
  version: z.number().int().positive(),
  document: z.unknown(),
});

const updateResumeSummarySchema = z.object({
  version: z.number().int().positive(),
  summary: z.string().trim().min(1).max(160),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalSession();

  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const resume = await getResumeRecord(session.user.id, id);

  if (!resume) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ resume });
}

export async function PUT(
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
    const body = updateResumeSchema.parse(
      await parseLimitedJsonRequest(request),
    );
    const resume = await saveResumeRecord({
      userId: session.user.id,
      resumeId: id,
      version: body.version,
      document: body.document,
    });

    return NextResponse.json({ resume });
  } catch (error) {
    if (error instanceof ResumeVersionConflictError) {
      return NextResponse.json(
        {
          error: "version_conflict",
          currentVersion: error.currentVersion,
        },
        { status: 409 },
      );
    }

    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "resume_payload_too_large" },
        { status: 413 },
      );
    }

    if (error instanceof ResumeDocumentValidationError) {
      return NextResponse.json(
        {
          error: "resume_validation_failed",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    if (error instanceof ResumeNotFoundError) {
      return NextResponse.json(
        {
          error: "not_found",
        },
        { status: 404 },
      );
    }

    if (
      error instanceof SyntaxError ||
      error instanceof z.ZodError ||
      isResumeStructureValidationError(error)
    ) {
      return NextResponse.json(
        {
          error: "invalid_resume_payload",
        },
        { status: 400 },
      );
    }

    throw error;
  }
}

export async function PATCH(
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
    const body = updateResumeSummarySchema.parse(
      await parseLimitedJsonRequest(request),
    );
    const resume = await saveResumeRecord({
      userId: session.user.id,
      resumeId: id,
      version: body.version,
      summary: body.summary,
    });

    return NextResponse.json({ resume });
  } catch (error) {
    if (error instanceof ResumeVersionConflictError) {
      return NextResponse.json(
        {
          error: "version_conflict",
          currentVersion: error.currentVersion,
        },
        { status: 409 },
      );
    }

    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "resume_payload_too_large" },
        { status: 413 },
      );
    }

    if (error instanceof ResumeNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_resume_summary" },
        { status: 400 },
      );
    }

    throw error;
  }
}
