import {
  AdminPage,
  AdminStatus,
  AdminTable,
} from "@/components/admin/AdminPage";
import { AdminExportActions } from "@/components/admin/AdminExportActions";
import type { PdfExportJobStatus } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin/page";
import { listAdminExports } from "@/lib/admin/query";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";
import {
  createAdminTranslator,
  type AdminMessageKey,
} from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

const exportStatusPresentation: Record<
  PdfExportJobStatus,
  {
    messageKey: AdminMessageKey;
    tone: "danger" | "default" | "info" | "success" | "warning";
  }
> = {
  queued: { messageKey: "exports.status.queued", tone: "warning" },
  running: { messageKey: "exports.status.running", tone: "info" },
  completed: { messageKey: "exports.status.completed", tone: "success" },
  failed: { messageKey: "exports.status.failed", tone: "danger" },
  cancelled: { messageKey: "exports.status.cancelled", tone: "default" },
};

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
        actionColumn
        headers={[t("exports.file"), t("exports.requester"), t("exports.status"), t("exports.attempts"), t("exports.createdAt"), t("common.actions")]}
        pagination={{
          basePath: "/app/manage/exports",
          page: exports.page,
          pageSize: exports.pageSize,
          searchParams: resolvedSearchParams,
          total: exports.total,
          totalPages: exports.totalPages,
        }}
        rows={exports.items.map((job) => {
          const status = exportStatusPresentation[job.status];
          return [
            job.filename,
            job.requesterEmail || t("exports.anonymous"),
            <AdminStatus key="status" tone={status.tone}>
              {t(status.messageKey)}
            </AdminStatus>,
            job.attempts,
            job.createdAt.toLocaleString(locale),
            <AdminExportActions
              canCancel={context.kind === "super_admin" || context.permissions.includes("exports.cancel")}
              canRetry={context.kind === "super_admin" || context.permissions.includes("exports.retry")}
              filename={job.filename}
              jobId={job.id}
              key="actions"
              status={job.status}
            />,
          ];
        })}
      />
    </AdminPage>
  );
}
