import {
  AdminMetric,
  AdminMetricGrid,
  AdminPage,
  AdminSection,
  AdminTable,
} from "@/components/admin/AdminPage";
import { ConfigurationRuntimeStatusTable } from "@/components/system/ConfigurationRuntimeStatusTable";
import { SystemRestartControl } from "@/components/system/SystemRestartControl";
import { requireAdminPage } from "@/lib/admin/page";
import { getAdminSystemStatus, listAdminWorkers } from "@/lib/admin/query";
import { getCurrentSystemRestartOperation } from "@/lib/admin/system-restart/service";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";
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
  const context = await requireAdminPage("system.read");
  const resolvedSearchParams = await searchParams;
  const identity = resolveRuntimeIdentity("web");
  const [status, workers, initialOperation] = await Promise.all([
    getAdminSystemStatus(),
    listAdminWorkers({
      ...parsePageRequest(resolvedSearchParams),
      query: readSearchParam(resolvedSearchParams, "q"),
    }),
    getCurrentSystemRestartOperation({ deploymentId: identity.deploymentId }),
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
          label={t("system.desiredConfiguration")}
          value={status.desiredConfiguration
            ? t("configuration.version", {
                version: status.desiredConfiguration.version,
              })
            : t("system.unknown")}
        />
        <AdminMetric
          label={t("system.smtp")}
          tone={status.smtpConfigured ? "success" : "warning"}
          value={status.smtpConfigured ? t("system.configured") : t("system.unconfigured")}
        />
        <AdminMetric label={t("system.concurrency")} value={status.queue.maxConcurrency} />
      </AdminMetricGrid>
      <AdminSection title={t("system.configurationRuntime")}>
        <SystemRestartControl
          canRestart={
            context.kind === "super_admin" ||
            context.permissions.includes("system.restart")
          }
          initialOperation={initialOperation}
          runtimes={status.configurationInstances}
        />
        <ConfigurationRuntimeStatusTable
          locale={locale}
          recoveryHref="/app/manage/configuration"
          states={status.configurationInstances}
          text={{
            consumer: t("system.configurationConsumer"),
            desiredVersion: t("system.desiredVersion"),
            error: t("system.configurationError"),
            fallbackVersion: t("system.fallbackVersion"),
            historyAction: t("system.configurationRecoveryAction"),
            hotVersion: t("system.hotVersion"),
            instance: t("system.configurationInstance"),
            lastSync: t("system.lastSynchronization"),
            onlineRestart: t("system.onlineRestart"),
            onlineRestartAvailable: t("system.onlineRestart.available"),
            onlineRestartUnavailable: t("system.onlineRestart.unavailable"),
            release: t("system.release"),
            restartVersion: t("system.restartVersion"),
            state: t("system.configurationState"),
            supervisor: t("system.supervisor"),
            supervisors: {
              "docker-compose": t("system.supervisor.dockerCompose"),
              systemd: t("system.supervisor.systemd"),
              container: t("system.supervisor.container"),
              manual: t("system.supervisor.manual"),
            },
            states: {
              current: t("system.configurationState.current"),
              error: t("system.configurationState.error"),
              pending_restart: t("system.configurationState.pendingRestart"),
              recovery_required: t("system.configurationState.recoveryRequired"),
              stale: t("system.configurationState.stale"),
            },
            unknown: t("system.unknown"),
          }}
        />
      </AdminSection>
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
