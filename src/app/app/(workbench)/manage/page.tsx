import {
  AdminMetric,
  AdminMetricGrid,
  AdminPage,
} from "@/components/admin/AdminPage";
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
      <AdminMetricGrid>
        <AdminMetric label={t("overview.users")} value={overview.users} />
        <AdminMetric label={t("overview.resumes")} value={overview.resumes} />
        <AdminMetric
          label={t("overview.published")}
          tone="success"
          value={overview.published}
        />
        <AdminMetric
          label={t("overview.exportsActive")}
          tone="info"
          value={overview.queued}
        />
        <AdminMetric
          label={t("overview.exportsFailed")}
          tone={overview.failed > 0 ? "danger" : "default"}
          value={overview.failed}
        />
      </AdminMetricGrid>
    </AdminPage>
  );
}
