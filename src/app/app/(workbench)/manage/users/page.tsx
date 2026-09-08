import { AdminPage, AdminTable } from "@/components/admin/AdminPage";
import { AdminInviteUser } from "@/components/admin/AdminInviteUser";
import { AdminUserActions } from "@/components/admin/AdminUserActions";
import { requireAdminPage } from "@/lib/admin-page";
import { listAdminRoles, listAdminUsers } from "@/lib/admin-query";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementUsersPage() {
  const context = await requireAdminPage("users.read");
  const [users, roles] = await Promise.all([
    listAdminUsers(),
    context.kind === "super_admin" ? listAdminRoles() : Promise.resolve([]),
  ]);
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);
  return (
    <AdminPage title={t("nav.users")}>
      {context.kind === "super_admin" || context.permissions.includes("users.invite") ? (
        <div style={{ marginBottom: 16 }}>
          <AdminInviteUser
            canAssignRole={context.kind === "super_admin"}
            roles={roles.map(({ id, name }) => ({ id, name }))}
          />
        </div>
      ) : null}
      <AdminTable
        headers={[t("nav.users"), t("users.emailVerification"), t("users.resumeCount"), t("users.adminIdentity"), t("users.status"), t("users.createdAt"), t("common.actions")]}
        rows={users.map((user) => {
          const canOperateTarget =
            context.kind === "super_admin" || user.principalKind === null;
          return [
            <span key="identity"><strong>{user.name}</strong><small>{user.email}</small></span>,
            user.emailVerified ? t("users.verified") : t("users.unverified"),
            user.resumes,
            user.principalKind === "super_admin" ? t("shell.superAdmin") : user.roleName || t("users.regular"),
            user.suspended ? t("users.suspended") : t("users.normal"),
            user.createdAt.toLocaleString(locale),
            user.principalKind === "super_admin" ? "-" : (
              <AdminUserActions
                canRevokeSessions={canOperateTarget && (context.kind === "super_admin" || context.permissions.includes("users.sessions.revoke"))}
                canSuspend={canOperateTarget && (context.kind === "super_admin" || context.permissions.includes("users.suspend"))}
                key="actions"
                suspended={user.suspended}
                userId={user.id}
              />
            ),
          ];
        })}
      />
    </AdminPage>
  );
}
