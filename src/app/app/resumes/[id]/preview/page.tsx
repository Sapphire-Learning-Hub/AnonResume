import { notFound } from "next/navigation";

import { ResumeViewShell } from "@/components/resume/ResumeViewShell";
import { getRequestMessages } from "@/i18n/server";
import { requireSession } from "@/lib/auth/session";
import { getEditorOnboardingRunForResume } from "@/lib/onboarding/repository";
import { markEditorOnboardingPreviewVisited } from "@/lib/onboarding/service";
import { getResumeRecord } from "@/lib/resume/repository";

export default async function ResumePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const messages = await getRequestMessages();
  const { id } = await params;
  const [resume, onboardingRun] = await Promise.all([
    getResumeRecord(session.user.id, id),
    getEditorOnboardingRunForResume(session.user.id, id),
  ]);

  if (!resume) {
    notFound();
  }

  if (onboardingRun) {
    await markEditorOnboardingPreviewVisited({
      userId: session.user.id,
      resumeId: id,
    });
  }

  return (
    <ResumeViewShell
      eyebrow={
        messages[
          onboardingRun ? "onboarding.practicePreview" : "view.previewEyebrow"
        ]
      }
      title={resume.title}
      backHref={`/app/resumes/${resume.id}`}
      backLabel={
        messages[
          onboardingRun ? "onboarding.returnToPractice" : "common.backToEditor"
        ]
      }
      document={resume.document}
    />
  );
}
