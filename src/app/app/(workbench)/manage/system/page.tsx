import { AdminPage, AdminTable } from "@/components/admin/AdminPage";
import { requireAdminPage } from "@/lib/admin-page";
import { getAdminSystemStatus, listAdminWorkers } from "@/lib/admin-query";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/pagination";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementSystemPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  await requireAdminPage("system.read");
  const resolvedSearchParams = await searchParams;
  const [status, workers] = await Promise.all([
    getAdminSystemStatus(),
    listAdminWorkers({
      ...parsePageRequest(resolvedSearchParams),
      query: readSearchParam(resolvedSearchParams, "q"),
    }),
  ]);
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);
  return (
    <AdminPage title={t("nav.system")}>
      <div className="admin-stat-grid">
        <article><span>{t("system.release")}</span><strong>{status.release}</strong></article>
        <article><span>{t("system.configuration")}</span><strong>{status.configurationValid ? t("system.normal") : t("system.abnormal")}</strong></article>
        <article><span>{t("system.smtp")}</span><strong>{status.smtpConfigured ? t("system.configured") : t("system.unconfigured")}</strong></article>
        <article><span>{t("system.concurrency")}</span><strong>{status.queue.maxConcurrency}</strong></article>
      </div>
      <h2 className="admin-section-title">{t("system.workerHeartbeat")}</h2>
      <AdminTable
        headers={[t("system.worker"), t("system.type"), t("system.release"), t("system.lastHeartbeat")]}
        pagination={{
          basePath: "/app/manage/system",
          page: workers.page,
          pageSize: workers.pageSize,
          searchParams: resolvedSearchParams,
          total: workers.total,
          totalPages: workers.totalPages,
        }}
        rows={workers.items.map((worker) => [
          worker.workerId,
          worker.workerType,
          worker.release || t("system.unknown"),
          worker.lastSeenAt.toLocaleString(locale),
        ])}
      />
    </AdminPage>
  );
}
