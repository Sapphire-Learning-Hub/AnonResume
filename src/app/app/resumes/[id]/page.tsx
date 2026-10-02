import { notFound } from "next/navigation";

import { EditorViewportGuard } from "@/components/editor/EditorViewportGuard";
import { ResumeEditorShell } from "@/components/editor/ResumeEditorShell";
import { requireSession } from "@/lib/auth/session";
import { getRuntimeConfig } from "@/lib/config/runtime";
import { getEditorOnboardingRunForResume } from "@/lib/onboarding/repository";
import {
  getResumeRecord,
  getResumeVersionHistoryLimit,
} from "@/lib/resume/repository";

export default async function ResumeEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const [resume, runtime, onboardingRun] = await Promise.all([
    getResumeRecord(session.user.id, id),
    getRuntimeConfig("web"),
    getEditorOnboardingRunForResume(session.user.id, id),
  ]);

  if (!resume) {
    notFound();
  }

  return (
    <EditorViewportGuard>
      <ResumeEditorShell
        resumeId={id}
        publicSlug={resume.published ? resume.slug : undefined}
        initialDocument={resume.document}
        initialSummary={resume.summary}
        initialVersion={resume.version}
        initialUpdatedAt={resume.updatedAt}
        onboardingRun={onboardingRun}
        versionHistoryLimit={getResumeVersionHistoryLimit(runtime.values)}
      />
    </EditorViewportGuard>
  );
}
