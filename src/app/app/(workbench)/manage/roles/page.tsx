import { redirect } from "next/navigation";

import { AdminPage } from "@/components/admin/AdminPage";
import { AdminRoleManager } from "@/components/admin/AdminRoleManager";
import { requireAdminPage } from "@/lib/admin-page";
import { listAdminAdministrators, listAdminRoles } from "@/lib/admin-query";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/pagination";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementRolesPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  const context = await requireAdminPage();
  if (context.kind !== "super_admin") redirect("/app/manage/forbidden");
  const resolvedSearchParams = await searchParams;
  const [roles, administrators] = await Promise.all([
    listAdminRoles({
      ...parsePageRequest(resolvedSearchParams, {
        pageParam: "rolePage",
        pageSizeParam: "rolePageSize",
      }),
      query: readSearchParam(resolvedSearchParams, "roleQuery"),
    }),
    listAdminAdministrators({
      ...parsePageRequest(resolvedSearchParams, {
        pageParam: "adminPage",
        pageSizeParam: "adminPageSize",
      }),
      query: readSearchParam(resolvedSearchParams, "adminQuery"),
    }),
  ]);
  const t = createAdminTranslator(await getRequestLocale());
  return (
    <AdminPage title={t("nav.roles")}>
      <AdminRoleManager
        administrators={administrators}
        roles={roles}
        searchParams={resolvedSearchParams}
      />
    </AdminPage>
  );
}
