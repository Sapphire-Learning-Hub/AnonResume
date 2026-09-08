import { AdminPage, AdminTable } from "@/components/admin/AdminPage";
import { requireAdminPage } from "@/lib/admin-page";
import { getAdminSystemStatus } from "@/lib/admin-query";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementSystemPage() {
  await requireAdminPage("system.read");
  const status = await getAdminSystemStatus();
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
        rows={status.workers.map((worker) => [
          worker.workerId,
          worker.workerType,
          worker.release || t("system.unknown"),
          worker.lastSeenAt.toLocaleString(locale),
        ])}
      />
    </AdminPage>
  );
}
