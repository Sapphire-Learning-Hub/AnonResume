import {
  AdminIdentity,
  AdminPage,
  AdminStatus,
  AdminTable,
} from "@/components/admin/AdminPage";
import { AdminInviteUser } from "@/components/admin/AdminInviteUser";
import { AdminUserActions } from "@/components/admin/AdminUserActions";
import { requireAdminPage } from "@/lib/admin/page";
import { listAdminUsers } from "@/lib/admin/query";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";
import {
  createAdminTranslator,
  getAdminSystemRolePresentation,
} from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export default async function ManagementUsersPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  const context = await requireAdminPage("users.read");
  const resolvedSearchParams = await searchParams;
  const users = await listAdminUsers({
    ...parsePageRequest(resolvedSearchParams),
    query: readSearchParam(resolvedSearchParams, "q"),
  });
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);
  const canInvite =
    context.kind === "super_admin" ||
    context.permissions.includes("users.invite");
  return (
    <AdminPage
      actions={
        canInvite ? (
          <AdminInviteUser canAssignRole={context.kind === "super_admin"} />
        ) : null
      }
      title={t("nav.users")}
    >
      <AdminTable
        actionColumn
        headers={[t("nav.users"), t("users.emailVerification"), t("users.resumeCount"), t("users.adminIdentity"), t("users.status"), t("users.createdAt"), t("common.actions")]}
        pagination={{
          basePath: "/app/manage/users",
          page: users.page,
          pageSize: users.pageSize,
          searchParams: resolvedSearchParams,
          total: users.total,
          totalPages: users.totalPages,
        }}
        rows={users.items.map((user) => {
          const canOperateTarget =
            context.kind === "super_admin" || user.principalKind === null;
          const assignedRoleNames = user.roles.map((role) =>
            role.systemKey
              ? getAdminSystemRolePresentation(t, role.systemKey).name
              : role.name,
          );
          return [
            <AdminIdentity
              description={user.email}
              key="identity"
              title={user.name}
            />,
            <AdminStatus
              key="verification"
              tone={user.emailVerified ? "success" : "warning"}
            >
              {user.emailVerified ? t("users.verified") : t("users.unverified")}
            </AdminStatus>,
            user.resumes,
            user.principalKind === "super_admin"
              ? t("shell.superAdmin")
              : assignedRoleNames.length > 0
                ? assignedRoleNames.join("、")
                : t("users.regular"),
            <AdminStatus
              key="status"
              tone={user.suspended ? "danger" : "success"}
            >
              {user.suspended ? t("users.suspended") : t("users.normal")}
            </AdminStatus>,
            user.createdAt.toLocaleString(locale),
            user.principalKind === "super_admin" ? "-" : (
              <AdminUserActions
                canRevokeSessions={canOperateTarget && (context.kind === "super_admin" || context.permissions.includes("users.sessions.revoke"))}
                canSuspend={canOperateTarget && (context.kind === "super_admin" || context.permissions.includes("users.suspend"))}
                key="actions"
                suspended={user.suspended}
                userId={user.id}
                userName={user.name}
              />
            ),
          ];
        })}
      />
    </AdminPage>
  );
}
