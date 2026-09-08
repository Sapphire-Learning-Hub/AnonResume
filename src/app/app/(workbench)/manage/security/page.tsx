import { AdminPage } from "@/components/admin/AdminPage";
import { AdminSecurityPanel } from "@/components/admin/AdminSecurityPanel";
import { requireAdminPage } from "@/lib/admin-page";
import { getAdminSecuritySummary } from "@/lib/admin-store";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementSecurityPage() {
  const context = await requireAdminPage(undefined, {
    allowRecoveryRequired: true,
  });
  const security = await getAdminSecuritySummary(context.userId);
  const t = createAdminTranslator(await getRequestLocale());
  return (
    <AdminPage title={t("nav.security")}>
      <AdminSecurityPanel {...security} />
    </AdminPage>
  );
}
