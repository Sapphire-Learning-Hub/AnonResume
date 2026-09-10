import { AdminAuditLog } from "@/components/admin/AdminAuditLog";
import { AdminPage } from "@/components/admin/AdminPage";
import { requireAdminPage } from "@/lib/admin/page";
import { listAdminAuditEvents } from "@/lib/admin/query";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";
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
      <AdminAuditLog
        events={{
          ...events,
          items: events.items.map((event) => ({
            ...event,
            createdAt: event.createdAt.toISOString(),
          })),
        }}
        locale={locale}
        searchParams={resolvedSearchParams}
      />
    </AdminPage>
  );
}
