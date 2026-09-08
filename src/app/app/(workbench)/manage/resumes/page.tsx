import { AdminPage, AdminTable } from "@/components/admin/AdminPage";
import { AdminResumeActions } from "@/components/admin/AdminResumeActions";
import { requireAdminPage } from "@/lib/admin-page";
import { listAdminResumeMetadata } from "@/lib/admin-query";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementResumesPage() {
  const context = await requireAdminPage("resumes.metadata.read");
  const resumes = await listAdminResumeMetadata();
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);
  return (
    <AdminPage title={t("nav.resumes")}>
      <AdminTable
        headers={[t("nav.resumes"), t("resumes.owner"), t("resumes.status"), t("resumes.updatedAt"), t("common.actions")]}
        rows={resumes.map((resume) => [
          <span key="resume"><strong>{resume.name}</strong><small>{resume.summary || resume.id}</small></span>,
          resume.ownerEmail,
          resume.published ? t("resumes.published") : t("resumes.draft"),
          resume.updatedAt.toLocaleString(locale),
          <AdminResumeActions
            canReadContent={context.kind === "super_admin" || context.permissions.includes("resumes.content.read")}
            canUnpublish={context.kind === "super_admin" || context.permissions.includes("resumes.unpublish")}
            key="actions"
            published={resume.published}
            resumeId={resume.id}
            userId={resume.userId}
          />,
        ])}
      />
    </AdminPage>
  );
}
