import { AdminPage } from "@/components/admin/AdminPage";
import { requireAdminPage } from "@/lib/admin-page";
import { getAdminOverview } from "@/lib/admin-query";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementOverviewPage() {
  await requireAdminPage("overview.read");
  const overview = await getAdminOverview();
  const t = createAdminTranslator(await getRequestLocale());

  return (
    <AdminPage title={t("nav.overview")}>
      <div className="admin-stat-grid">
        <article><span>{t("overview.users")}</span><strong>{overview.users}</strong></article>
        <article><span>{t("overview.resumes")}</span><strong>{overview.resumes}</strong></article>
        <article><span>{t("overview.published")}</span><strong>{overview.published}</strong></article>
        <article><span>{t("overview.exportsActive")}</span><strong>{overview.queued}</strong></article>
        <article><span>{t("overview.exportsFailed")}</span><strong>{overview.failed}</strong></article>
      </div>
    </AdminPage>
  );
}
