import { notFound } from "next/navigation";

import { ResumePrintShell } from "@/components/resume/ResumePrintShell";
import { getRequestMessages } from "@/i18n/server";
import { requireSession } from "@/lib/auth-session";
import { getResumeRecord } from "@/lib/resume-repository";

export default async function ResumePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const messages = await getRequestMessages();
  const { id } = await params;
  const resume = await getResumeRecord(session.user.id, id);

  if (!resume) {
    notFound();
  }

  return (
    <ResumePrintShell
      eyebrow={messages["print.eyebrow"]}
      title={resume.title}
      backHref={`/app/resumes/${resume.id}`}
      backLabel={messages["common.backToEditor"]}
      document={resume.document}
    />
  );
}
