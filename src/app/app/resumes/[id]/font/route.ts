import { NextResponse } from "next/server";

import { getResumeFontPreset } from "@/domain/resume/font-presets";
import { requireSession } from "@/lib/auth-session";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedFormDataRequest,
  RequestBodyTooLargeError,
} from "@/lib/request-body";
import { createApplicationUrl, requireSameOrigin } from "@/lib/request-origin";
import {
  getResumeRecord,
  ResumeNotFoundError,
  saveResumeRecord,
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
  const requestedReturnTo = formData.get("returnTo");
  const fontPreset =
    typeof fontPresetId === "string"
      ? getResumeFontPreset(fontPresetId)
      : undefined;

  if (!fontPreset) {
    return NextResponse.json({ error: "invalid_font_preset" }, { status: 400 });
  }

  const resume = await getResumeRecord(session.user.id, id);

  if (!resume) {
    throw new ResumeNotFoundError(id);
  }

  const document = structuredClone(resume.document);
  document.settings.typography.fontFamily = fontPreset.fontFamily;

  await saveResumeRecord({
    userId: session.user.id,
    resumeId: id,
    version: resume.version,
    document,
  });

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
