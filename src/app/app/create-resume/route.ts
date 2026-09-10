import { NextResponse } from "next/server";

import {
  isResumeTemplateId,
  type ResumeTemplateId,
} from "@/domain/resume/templates";
import { importResumeMarkdown } from "@/domain/resume/import/markdown";
import { isResumeMarkdownDialect } from "@/domain/resume/import/types";
import { getRequestLocale } from "@/i18n/server";
import { requireSession } from "@/lib/auth/session";
import {
  parseLimitedFormDataRequest,
  RequestBodyTooLargeError,
} from "@/lib/http/request-body";
import { createApplicationUrl, requireSameOrigin } from "@/lib/http/request-origin";
import { createGeneratedResumeRecord } from "@/lib/resume/repository";

export async function POST(request: Request) {
  const forbiddenResponse = requireSameOrigin(request);

  if (forbiddenResponse) {
    return forbiddenResponse;
  }

  const session = await requireSession();
  let templateId: ResumeTemplateId = "blank";
  let importedDocument: ReturnType<typeof importResumeMarkdown>["document"] | undefined;
  let requestedReturnTo: FormDataEntryValue | null = null;

  if (request.body) {
    let formData: FormData;

    try {
      formData = await parseLimitedFormDataRequest(request);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          { error: "resume_import_payload_too_large" },
          { status: 413 },
        );
      }

      throw error;
    }

    const creationMode = formData.get("creationMode");
    const templateValue = formData.get("templateId");

    requestedReturnTo = formData.get("returnTo");

    if (creationMode !== null && creationMode !== "markdown") {
      return NextResponse.json(
        { error: "invalid_creation_mode" },
        { status: 400 },
      );
    }

    if (creationMode === "markdown") {
      if (templateValue !== null) {
        return NextResponse.json(
          { error: "invalid_creation_mode" },
          { status: 400 },
        );
      }

      const dialect = formData.get("dialect");
      const markdown = formData.get("markdown");

      if (!isResumeMarkdownDialect(dialect)) {
        return NextResponse.json(
          { error: "invalid_markdown_dialect" },
          { status: 400 },
        );
      }

      if (typeof markdown !== "string") {
        return NextResponse.json({ error: "source_empty" }, { status: 400 });
      }

      const imported = importResumeMarkdown({
        dialect,
        locale: await getRequestLocale(),
        markdown,
      });
      const blockingDiagnostic = imported.report.diagnostics.find(
        (diagnostic) => diagnostic.severity === "error",
      );

      if (blockingDiagnostic) {
        return NextResponse.json(
          { error: blockingDiagnostic.code },
          { status: 400 },
        );
      }

      importedDocument = imported.document;
    } else if (templateValue !== null && !isResumeTemplateId(templateValue)) {
      return NextResponse.json({ error: "invalid_template" }, { status: 400 });
    } else if (templateValue !== null) {
      templateId = templateValue;
    }
  }

  const locale = await getRequestLocale();
  const resume = await createGeneratedResumeRecord({
    userId: session.user.id,
    locale,
    ...(importedDocument ? { document: importedDocument } : { templateId }),
  });
  const redirectPath =
    requestedReturnTo === "/app" ? "/app" : `/app/resumes/${resume.id}`;
  const redirectUrl = createApplicationUrl(redirectPath, request);

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
