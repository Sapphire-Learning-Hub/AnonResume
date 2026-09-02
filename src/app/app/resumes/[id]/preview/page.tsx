import { notFound } from "next/navigation";

import { ResumeViewShell } from "@/components/resume/ResumeViewShell";
import { getRequestMessages } from "@/i18n/server";
import { requireSession } from "@/lib/auth-session";
import { getResumeRecord } from "@/lib/resume-repository";

export default async function ResumePreviewPage({
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
    <ResumeViewShell
      eyebrow={messages["view.previewEyebrow"]}
      title={resume.title}
      description={messages["view.previewDescription"]}
      backHref={`/app/resumes/${resume.id}`}
      backLabel={messages["common.backToEditor"]}
      document={resume.document}
    />
  );
}
