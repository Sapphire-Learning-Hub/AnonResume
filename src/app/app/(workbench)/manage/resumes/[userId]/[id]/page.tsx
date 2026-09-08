import { notFound } from "next/navigation";

import { AdminPage } from "@/components/admin/AdminPage";
import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import { ResponsiveResumeViewport } from "@/components/resume/ResponsiveResumeViewport";
import { requireAdminPage } from "@/lib/admin-page";
import { writeAdminAuditEvent } from "@/lib/admin-audit";
import { getResumeRecord } from "@/lib/resume-repository";

export default async function ManagementResumeContentPage({
  params,
}: {
  params: Promise<{ userId: string; id: string }>;
}) {
  const context = await requireAdminPage("resumes.content.read");
  const { userId, id } = await params;
  const resume = await getResumeRecord(userId, id);
  if (!resume) notFound();

  await writeAdminAuditEvent({
    actorUserId: context.userId,
    action: "resume.content.read",
    targetType: "resume",
    targetId: id,
    outcome: "success",
    metadata: { ownerUserId: userId },
  });

  return (
    <AdminPage title={resume.title}>
      <div className="admin-resume-preview">
        <ResponsiveResumeViewport>
          <ResumeRenderer document={resume.document} mode="view" />
        </ResponsiveResumeViewport>
      </div>
    </AdminPage>
  );
}
