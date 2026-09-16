import { redirect } from "next/navigation";

import { AdminAnnouncementManager } from "@/components/admin/AdminAnnouncementManager";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";
import { requireAdminPage } from "@/lib/admin/page";
import { listManagedAnnouncements } from "@/lib/announcements/management";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";

export default async function ManagementAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  const context = await requireAdminPage("announcements.read");
  if (
    context.kind !== "super_admin" &&
    !context.permissions.includes("announcements.read")
  ) {
    redirect("/app/manage/forbidden");
  }
  const resolvedSearchParams = await searchParams;
  const query = readSearchParam(resolvedSearchParams, "q") ?? "";
  const result = await listManagedAnnouncements({
    ...parsePageRequest(resolvedSearchParams),
    query,
  });
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);

  return (
    <AdminAnnouncementManager
      announcements={result.items.map((announcement) => ({
        ...announcement,
        publishedAt: announcement.publishedAt?.toISOString() ?? null,
        expiresAt: announcement.expiresAt?.toISOString() ?? null,
        createdAt: announcement.createdAt.toISOString(),
        updatedAt: announcement.updatedAt.toISOString(),
      }))}
      canManage={
        context.kind === "super_admin" ||
        context.permissions.includes("announcements.manage")
      }
      page={result.page}
      pageSize={result.pageSize}
      query={query}
      searchParams={resolvedSearchParams}
      title={t("nav.announcements")}
      total={result.total}
      totalPages={result.totalPages}
    />
  );
}
