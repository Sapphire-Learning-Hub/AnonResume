import { notFound } from "next/navigation";
import Link from "next/link";

import { AdminPage } from "@/components/admin/AdminPage";
import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import { ResponsiveResumeViewport } from "@/components/resume/ResponsiveResumeViewport";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";
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
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);

  await writeAdminAuditEvent({
    actorUserId: context.userId,
    action: "resume.content.read",
    targetType: "resume",
    targetId: id,
    outcome: "success",
    metadata: { ownerUserId: userId },
  });

  return (
    <AdminPage
      actions={
        <Link className="admin-page-back-link" href="/app/manage/resumes">
          <svg
            aria-hidden="true"
            fill="none"
            height="16"
            viewBox="0 0 24 24"
            width="16"
          >
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          {t("resumes.backToList")}
        </Link>
      }
      title={resume.title}
    >
      <div className="admin-resume-preview">
        <ResponsiveResumeViewport>
          <ResumeRenderer document={resume.document} mode="view" />
        </ResponsiveResumeViewport>
      </div>
    </AdminPage>
  );
}
