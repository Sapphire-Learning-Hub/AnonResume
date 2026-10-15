import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedFormDataRequest,
  RequestBodyTooLargeError,
} from "@/lib/http/request-body";
import { createApplicationUrl, requireSameOrigin } from "@/lib/http/request-origin";
import { InvalidFontPresetError } from "@/lib/resume/fonts/preferences";
import { applyResumeFontPreset } from "@/lib/resume/fonts/service";
import { ResumeVersionConflictError } from "@/lib/resume/repository";

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
  let formData: FormData;

  try {
    formData = await parseLimitedFormDataRequest(
      request,
      MAX_ACTION_REQUEST_BYTES,
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "request_payload_too_large" },
        { status: 413 },
      );
    }

    throw error;
  }

  const fontPresetId = formData.get("fontPresetId");
  const versionValue = formData.get("version");
  const requestedReturnTo = formData.get("returnTo");

  if (typeof fontPresetId !== "string") {
    return NextResponse.json({ error: "invalid_font_preset" }, { status: 400 });
  }

  if (
    typeof versionValue !== "string" ||
    !/^\d+$/.test(versionValue) ||
    Number(versionValue) < 1
  ) {
    return NextResponse.json({ error: "invalid_version" }, { status: 400 });
  }

  try {
    await applyResumeFontPreset({
      userId: session.user.id,
      resumeId: id,
      version: Number(versionValue),
      fontPresetId,
    });
  } catch (error) {
    if (error instanceof InvalidFontPresetError) {
      return NextResponse.json({ error: "invalid_font_preset" }, { status: 400 });
    }

    if (error instanceof ResumeVersionConflictError) {
      return NextResponse.json(
        { error: "version_conflict", currentVersion: error.currentVersion },
        { status: 409 },
      );
    }

    throw error;
  }

  const editorReturnTo = `/app/resumes/${id}`;
  const returnTo =
    requestedReturnTo === null
      ? editorReturnTo
      : requestedReturnTo === editorReturnTo || requestedReturnTo === "/app/fonts"
        ? requestedReturnTo
        : "/app/fonts";

  return NextResponse.redirect(createApplicationUrl(returnTo, request), {
    status: 303,
  });
}
