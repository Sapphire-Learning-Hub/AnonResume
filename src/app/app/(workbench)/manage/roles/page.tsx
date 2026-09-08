import { redirect } from "next/navigation";

import { AdminPage } from "@/components/admin/AdminPage";
import { AdminRoleManager } from "@/components/admin/AdminRoleManager";
import { requireAdminPage } from "@/lib/admin-page";
import { listAdminRoles, listAdminUsers } from "@/lib/admin-query";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementRolesPage() {
  const context = await requireAdminPage();
  if (context.kind !== "super_admin") redirect("/app/manage/forbidden");
  const [roles, users] = await Promise.all([listAdminRoles(), listAdminUsers()]);
  const t = createAdminTranslator(await getRequestLocale());
  return (
    <AdminPage title={t("nav.roles")}>
      <AdminRoleManager roles={roles} users={users} />
    </AdminPage>
  );
}
