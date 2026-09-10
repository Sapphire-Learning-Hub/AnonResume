import {
  AdminMetric,
  AdminMetricGrid,
  AdminPage,
  AdminSection,
  AdminTable,
} from "@/components/admin/AdminPage";
import { requireAdminPage } from "@/lib/admin/page";
import { getAdminSystemStatus, listAdminWorkers } from "@/lib/admin/query";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";
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
      <AdminMetricGrid>
        <AdminMetric label={t("system.release")} value={status.release} />
        <AdminMetric
          label={t("system.configuration")}
          tone={status.configurationValid ? "success" : "danger"}
          value={status.configurationValid ? t("system.normal") : t("system.abnormal")}
        />
        <AdminMetric
          label={t("system.smtp")}
          tone={status.smtpConfigured ? "success" : "warning"}
          value={status.smtpConfigured ? t("system.configured") : t("system.unconfigured")}
        />
        <AdminMetric label={t("system.concurrency")} value={status.queue.maxConcurrency} />
      </AdminMetricGrid>
      <AdminSection title={t("system.workerHeartbeat")}>
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
      </AdminSection>
    </AdminPage>
  );
}
