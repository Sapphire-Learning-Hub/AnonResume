"use client";

import { Alert, Button, Checkbox, Input, Modal, Select } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { AdminPagedSelect } from "@/components/admin/AdminPagedSelect";
import { AdminTable } from "@/components/admin/AdminPage";
import {
  createAdminTranslator,
  type AdminMessageKey,
} from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_ROLE_PRESETS,
  type AdminPermission,
  type AdminRolePresetKey,
} from "@/lib/admin-permissions";
import type { PageResult, PaginationSearchParams } from "@/lib/pagination";

const useStyles = createStyles(({ token, css }) => ({
  toolbar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 18px;
  `,
  form: css`
    display: grid;
    gap: 12px;
  `,
  permissions: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 12px;
  `,
}));

interface RoleSummary {
  id: string;
  name: string;
  description: string;
  permissions: AdminPermission[];
  members: number;
}

interface UserSummary {
  id: string;
  name: string;
  email: string;
  principalKind: string | null;
  roleName: string | null;
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

const presetMessageKeys: Record<
  AdminRolePresetKey,
  { name: AdminMessageKey; description: AdminMessageKey }
> = {
  read_only_auditor: {
    name: "preset.read_only_auditor.name",
    description: "preset.read_only_auditor.description",
  },
  support_operator: {
    name: "preset.support_operator.name",
    description: "preset.support_operator.description",
  },
  content_reviewer: {
    name: "preset.content_reviewer.name",
    description: "preset.content_reviewer.description",
  },
  system_operator: {
    name: "preset.system_operator.name",
    description: "preset.system_operator.description",
  },
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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [editingRoleId, setEditingRoleId] = useState<string>();
  const [selectedUser, setSelectedUser] = useState<string>();
  const [selectedRole, setSelectedRole] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [deferredAction, setDeferredAction] = useState<(() => Promise<void>) | null>(null);

  async function runAction(action: () => Promise<Response>) {
    setPending(true);
    setError(null);
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
      setError(
        caught instanceof Error ? caught.message : t("common.operationFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  function applyPreset(key: AdminRolePresetKey) {
    const preset = ADMIN_ROLE_PRESETS[key];
    const messages = presetMessageKeys[key];
    setName(t(messages.name));
    setDescription(t(messages.description));
    setPermissions([...preset.permissions]);
  }

  function openRoleForm(role?: RoleSummary) {
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
      setError(
        caught instanceof Error ? caught.message : t("common.operationFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {error ? <Alert closable message={error} onClose={() => setError(null)} showIcon type="error" /> : null}
      <div className={styles.toolbar}>
        <Button onClick={() => openRoleForm()} type="primary">{t("roles.create")}</Button>
        <AdminPagedSelect
          endpoint="/api/manage/users"
          onChange={setSelectedUser}
          placeholder={t("roles.selectUser")}
          style={{ minWidth: 260 }}
          value={selectedUser}
        />
        <AdminPagedSelect
          endpoint="/api/manage/roles"
          onChange={setSelectedRole}
          placeholder={t("roles.selectRole")}
          style={{ minWidth: 180 }}
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
      </div>
      <AdminTable
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
        rows={roles.items.map((role) => [
          <span key="role"><strong>{role.name}</strong><small>{role.description}</small></span>,
          t("roles.permissionCount", { count: role.permissions.length }),
          role.members,
          <span key="actions">
                  <Button
                    onClick={() => openRoleForm(role)}
                    size="small"
                    type="text"
                  >{t("common.edit")}</Button>
                  <Button
                    danger
                    disabled={role.members > 0}
                    loading={pending}
                    onClick={() => runAction(() => fetch(`/api/manage/roles/${role.id}`, { method: "DELETE" }))}
                    size="small"
                    type="text"
                  >{t("common.delete")}</Button>
          </span>,
        ])}
      />

      <h2 className="admin-section-title">{t("roles.authorized")}</h2>
      <AdminTable
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
          <span key="user"><strong>{user.name}</strong><small>{user.email}</small></span>,
          user.roleName || t("roles.unassigned"),
          <span key="actions">
                  <Button
                    danger
                    loading={pending}
                    onClick={() => runAction(() => fetch("/api/manage/administrators", {
                      method: "DELETE",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ userId: user.id }),
                    }))}
                    size="small"
                    type="text"
                  >{t("roles.removeAdmin")}</Button>
          </span>,
        ])}
      />

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
          <Select
            onChange={applyPreset}
            options={(Object.keys(ADMIN_ROLE_PRESETS) as AdminRolePresetKey[]).map((key) => ({
              label: t(presetMessageKeys[key].name),
              value: key,
            }))}
            placeholder={t("roles.fromPreset")}
          />
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
        <p>{t("common.reauthDescription")}</p>
        <AdminOtpInput onChange={setReauthCode} value={reauthCode} />
      </Modal>
    </>
  );
}
