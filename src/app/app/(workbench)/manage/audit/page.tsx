import { AdminPage, AdminTable } from "@/components/admin/AdminPage";
import { requireAdminPage } from "@/lib/admin-page";
import { listAdminAuditEvents } from "@/lib/admin-query";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementAuditPage() {
  await requireAdminPage("audit.read");
  const events = await listAdminAuditEvents();
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);
  return (
    <AdminPage title={t("nav.audit")}>
      <AdminTable
        headers={[t("audit.action"), t("audit.actor"), t("audit.target"), t("audit.outcome"), t("audit.time")]}
        rows={events.map((event) => [
          event.action,
          event.actorUserId || t("audit.system"),
          `${event.targetType}${event.targetId ? ` · ${event.targetId}` : ""}`,
          event.outcome,
          event.createdAt.toLocaleString(locale),
        ])}
      />
    </AdminPage>
  );
}
