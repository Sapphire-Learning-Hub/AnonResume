import { AdminPage, AdminTable } from "@/components/admin/AdminPage";
import { AdminExportActions } from "@/components/admin/AdminExportActions";
import { requireAdminPage } from "@/lib/admin-page";
import { listAdminExports } from "@/lib/admin-query";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementExportsPage() {
  const context = await requireAdminPage("exports.read");
  const exports = await listAdminExports();
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);
  return (
    <AdminPage title={t("nav.exports")}>
      <AdminTable
        headers={[t("exports.file"), t("exports.requester"), t("exports.status"), t("exports.attempts"), t("exports.createdAt"), t("common.actions")]}
        rows={exports.map((job) => [
          job.filename,
          job.requesterEmail || t("exports.anonymous"),
          job.status,
          job.attempts,
          job.createdAt.toLocaleString(locale),
          <AdminExportActions
            canCancel={context.kind === "super_admin" || context.permissions.includes("exports.cancel")}
            canRetry={context.kind === "super_admin" || context.permissions.includes("exports.retry")}
            jobId={job.id}
            key="actions"
            status={job.status}
          />,
        ])}
      />
    </AdminPage>
  );
}
