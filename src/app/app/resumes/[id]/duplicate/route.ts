import { NextResponse } from "next/server";

import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";
import { requireSession } from "@/lib/auth-session";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedFormDataRequest,
  RequestBodyTooLargeError,
} from "@/lib/request-body";
import { requireSameOrigin } from "@/lib/request-origin";
import {
  duplicateGeneratedResumeRecord,
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
  const locale = await getRequestLocale();
  let requestedReturnTo: FormDataEntryValue | null = null;

  if (request.body) {
    try {
      requestedReturnTo = (
        await parseLimitedFormDataRequest(request, MAX_ACTION_REQUEST_BYTES)
      ).get("returnTo");
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          { error: "request_payload_too_large" },
          { status: 413 },
        );
      }

      throw error;
    }
  }

  const source = await getResumeRecord(session.user.id, id);

  if (!source) {
    throw new ResumeNotFoundError(id);
  }

  const messages = getMessages(locale);
  const copy = await duplicateGeneratedResumeRecord({
    userId: session.user.id,
    resumeId: id,
    title: `${source.title} - ${messages["dashboard.copySuffix"]}`,
  });
  const redirectPath =
    requestedReturnTo === "/app" ? "/app" : `/app/resumes/${copy.id}`;
  const redirectUrl = new URL(redirectPath, request.url);

  return NextResponse.redirect(redirectUrl);
}
