import { AdminPage, AdminTable } from "@/components/admin/AdminPage";
import { requireAdminPage } from "@/lib/admin-page";
import { listAdminAuditEvents } from "@/lib/admin-query";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/pagination";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementAuditPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  await requireAdminPage("audit.read");
  const resolvedSearchParams = await searchParams;
  const events = await listAdminAuditEvents({
    ...parsePageRequest(resolvedSearchParams),
    query: readSearchParam(resolvedSearchParams, "q"),
  });
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);
  return (
    <AdminPage title={t("nav.audit")}>
      <AdminTable
        headers={[t("audit.action"), t("audit.actor"), t("audit.target"), t("audit.outcome"), t("audit.time")]}
        pagination={{
          basePath: "/app/manage/audit",
          page: events.page,
          pageSize: events.pageSize,
          searchParams: resolvedSearchParams,
          total: events.total,
          totalPages: events.totalPages,
        }}
        rows={events.items.map((event) => [
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
