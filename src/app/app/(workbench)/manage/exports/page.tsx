import { AdminPage, AdminTable } from "@/components/admin/AdminPage";
import { AdminExportActions } from "@/components/admin/AdminExportActions";
import { requireAdminPage } from "@/lib/admin-page";
import { listAdminExports } from "@/lib/admin-query";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/pagination";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementExportsPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  const context = await requireAdminPage("exports.read");
  const resolvedSearchParams = await searchParams;
  const exports = await listAdminExports({
    ...parsePageRequest(resolvedSearchParams),
    query: readSearchParam(resolvedSearchParams, "q"),
  });
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);
  return (
    <AdminPage title={t("nav.exports")}>
      <AdminTable
        headers={[t("exports.file"), t("exports.requester"), t("exports.status"), t("exports.attempts"), t("exports.createdAt"), t("common.actions")]}
        pagination={{
          basePath: "/app/manage/exports",
          page: exports.page,
          pageSize: exports.pageSize,
          searchParams: resolvedSearchParams,
          total: exports.total,
          totalPages: exports.totalPages,
        }}
        rows={exports.items.map((job) => [
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
