"use client";

import { Button, Checkbox, Input, Modal } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { AdminPagedSelect } from "@/components/admin/AdminPagedSelect";
import {
  AdminIdentity,
  AdminSection,
  AdminTable,
  AdminTableActions,
  AdminToolbar,
} from "@/components/admin/AdminPage";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import {
  createAdminTranslator,
  getAdminSystemRolePresentation,
  type AdminMessageKey,
} from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import {
  ADMIN_PERMISSION_KEYS,
  type AdminPermission,
  type AdminSystemRoleKey,
} from "@/lib/admin-permissions";
import type { PageResult, PaginationSearchParams } from "@/lib/pagination";

const useStyles = createStyles(({ token, css }) => ({
  form: css`
    display: grid;
    gap: 12px;
  `,
  permissions: css`
    padding: 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;

    .ant-checkbox-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 12px;
    }

    @media (max-width: 520px) {
      .ant-checkbox-group {
        grid-template-columns: 1fr;
      }
    }
  `,
}));

interface RoleSummary {
  id: string;
  name: string;
  description: string;
  permissions: AdminPermission[];
  members: number;
  systemKey: AdminSystemRoleKey | null;
}

interface UserSummary {
  id: string;
  name: string;
  email: string;
  principalKind: string | null;
  roleName: string | null;
  roleSystemKey: AdminSystemRoleKey | null;
}

const permissionMessageKeys: Record<AdminPermission, AdminMessageKey> = {
  "overview.read": "permission.overview.read",
  "users.read": "permission.users.read",
  "users.invite": "permission.users.invite",
  "users.suspend": "permission.users.suspend",
  "users.sessions.revoke": "permission.users.sessions.revoke",
  "resumes.metadata.read": "permission.resumes.metadata.read",
  "resumes.content.read": "permission.resumes.content.read",
  "resumes.unpublish": "permission.resumes.unpublish",
  "exports.read": "permission.exports.read",
  "exports.cancel": "permission.exports.cancel",
  "exports.retry": "permission.exports.retry",
  "audit.read": "permission.audit.read",
  "system.read": "permission.system.read",
};

export function AdminRoleManager({
  administrators,
  roles,
  searchParams,
}: {
  administrators: PageResult<UserSummary>;
  roles: PageResult<RoleSummary>;
  searchParams: PaginationSearchParams;
}) {
  const { styles } = useStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [editingRoleId, setEditingRoleId] = useState<string>();
  const [selectedUser, setSelectedUser] = useState<string>();
  const [selectedRole, setSelectedRole] = useState<string>();
  const [pending, setPending] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [deferredAction, setDeferredAction] = useState<(() => Promise<void>) | null>(null);

  async function runAction(action: () => Promise<Response>) {
    setPending(true);
    try {
      const response = await action();
      if (response.status === 428) {
        setDeferredAction(() => async () => runAction(action));
        setReauthOpen(true);
        return;
      }
      if (!response.ok) {
        throw new Error(
          response.status === 409 ? t("roles.conflict") : t("roles.failed"),
        );
      }
      setOpen(false);
      router.refresh();
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : t("common.operationFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  function openRoleForm(role?: RoleSummary) {
    if (role?.systemKey) return;
    setEditingRoleId(role?.id);
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPermissions(role ? [...role.permissions] : []);
    setOpen(true);
  }

  async function reauthenticate() {
    setPending(true);
    try {
      const response = await fetch("/api/manage/session/reauth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: reauthCode }),
      });
      if (!response.ok) throw new Error(t("common.invalidCode"));
      setReauthOpen(false);
      setReauthCode("");
      const action = deferredAction;
      setDeferredAction(null);
      await action?.();
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : t("common.operationFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="admin-stack">
      <AdminToolbar>
        <Button onClick={() => openRoleForm()} type="primary">{t("roles.create")}</Button>
        <AdminPagedSelect
          className="admin-toolbar__select admin-toolbar__select--wide"
          endpoint="/api/manage/users"
          onChange={setSelectedUser}
          placeholder={t("roles.selectUser")}
          value={selectedUser}
        />
        <AdminPagedSelect
          className="admin-toolbar__select"
          endpoint="/api/manage/roles"
          onChange={setSelectedRole}
          placeholder={t("roles.selectRole")}
          value={selectedRole}
        />
        <Button
          disabled={!selectedUser || !selectedRole}
          loading={pending}
          onClick={() => runAction(() => fetch("/api/manage/administrators", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId: selectedUser, roleId: selectedRole }),
          }))}
        >
          {t("roles.assign")}
        </Button>
      </AdminToolbar>
      <AdminSection title={t("roles.role")}>
        <AdminTable
          actionColumn
          headers={[t("roles.role"), t("roles.permissions"), t("roles.administrators"), t("common.actions")]}
          pagination={{
            basePath: "/app/manage/roles",
            page: roles.page,
            pageParam: "rolePage",
            pageSize: roles.pageSize,
            searchParams,
            total: roles.total,
            totalPages: roles.totalPages,
          }}
          rows={roles.items.map((role) => {
            const systemRole = role.systemKey
              ? getAdminSystemRolePresentation(t, role.systemKey)
              : null;
            const roleName = systemRole?.name ?? role.name;
            const roleDescription = systemRole?.description ?? role.description;

            return [
              <AdminIdentity
                description={roleDescription}
                key="role"
                title={
                  <span className="admin-role-title">
                    {roleName}
                    {role.systemKey ? (
                      <span className="admin-system-role-badge">
                        {t("roles.system")}
                      </span>
                    ) : null}
                  </span>
                }
              />,
              t("roles.permissionCount", { count: role.permissions.length }),
              role.members,
              role.systemKey ? "-" : (
                <AdminTableActions key="actions">
                  <Button
                    onClick={() => openRoleForm(role)}
                    type="link"
                  >{t("common.edit")}</Button>
                  <Button
                    danger
                    disabled={role.members > 0}
                    loading={pending}
                    onClick={() => runAction(() => fetch(`/api/manage/roles/${role.id}`, { method: "DELETE" }))}
                    type="link"
                  >{t("common.delete")}</Button>
                </AdminTableActions>
              ),
            ];
          })}
        />
      </AdminSection>

      <AdminSection title={t("roles.authorized")}>
        <AdminTable
          actionColumn
          headers={[t("roles.user"), t("roles.role"), t("common.actions")]}
          pagination={{
            basePath: "/app/manage/roles",
            page: administrators.page,
            pageParam: "adminPage",
            pageSize: administrators.pageSize,
            searchParams,
            total: administrators.total,
            totalPages: administrators.totalPages,
          }}
          rows={administrators.items.map((user) => [
            <AdminIdentity
              description={user.email}
              key="user"
              title={user.name}
            />,
            user.roleSystemKey
              ? getAdminSystemRolePresentation(t, user.roleSystemKey).name
              : user.roleName || t("roles.unassigned"),
            <AdminTableActions key="actions">
              <Button
                danger
                loading={pending}
                onClick={() => runAction(() => fetch("/api/manage/administrators", {
                  method: "DELETE",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ userId: user.id }),
                }))}
                type="link"
              >{t("roles.removeAdmin")}</Button>
            </AdminTableActions>,
          ])}
        />
      </AdminSection>

      <Modal
        destroyOnHidden
        footer={null}
        onCancel={() => setOpen(false)}
        open={open}
        title={editingRoleId ? t("roles.edit") : t("roles.createTitle")}
      >
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void runAction(() => fetch(
              editingRoleId ? `/api/manage/roles/${editingRoleId}` : "/api/manage/roles",
              {
              method: editingRoleId ? "PUT" : "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, description, permissions }),
            }));
          }}
        >
          <Input onChange={(event) => setName(event.target.value)} placeholder={t("roles.name")} value={name} />
          <Input.TextArea onChange={(event) => setDescription(event.target.value)} placeholder={t("roles.description")} value={description} />
          <div className={styles.permissions}>
            <Checkbox.Group
              onChange={(values) => setPermissions(values as AdminPermission[])}
              value={permissions}
            >
              {ADMIN_PERMISSION_KEYS.map((permission) => (
                <Checkbox key={permission} value={permission}>{t(permissionMessageKeys[permission])}</Checkbox>
              ))}
            </Checkbox.Group>
          </div>
          <Button htmlType="submit" loading={pending} type="primary">
            {editingRoleId ? t("roles.save") : t("roles.create")}
          </Button>
        </form>
      </Modal>

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
        okText={t("common.verify")}
        onCancel={() => setReauthOpen(false)}
        onOk={reauthenticate}
        open={reauthOpen}
        title={t("common.reauthTitle")}
      >
        <div className="admin-dialog-form">
          <p className="admin-dialog-description">
            {t("common.reauthDescription")}
          </p>
          <AdminOtpInput onChange={setReauthCode} value={reauthCode} />
        </div>
      </Modal>
    </div>
  );
}
