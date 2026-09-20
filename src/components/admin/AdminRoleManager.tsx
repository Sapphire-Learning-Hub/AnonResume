"use client";

import { CheckCircleFilled, MinusCircleOutlined } from "@ant-design/icons";
import { Button, Checkbox, Input, Modal, Tag, theme } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import {
  AdminPagedSelect,
  type AdminSelectOption,
} from "@/components/admin/AdminPagedSelect";
import {
  AdminIdentity,
  AdminSection,
  AdminTable,
  AdminTableActions,
} from "@/components/admin/AdminPage";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
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
} from "@/lib/admin/permissions";
import type { PageResult, PaginationSearchParams } from "@/lib/shared/pagination";

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
  roleList: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    .ant-tag {
      margin: 0;
    }
  `,
  permissionPreview: css`
    padding: 14px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorFillAlter};
  `,
  permissionPreviewHeader: css`
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;

    strong {
      color: ${token.colorText};
    }

    span {
      color: ${token.colorTextSecondary};
      font-size: ${token.fontSizeSM}px;
    }
  `,
  permissionGroups: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    @media (max-width: 620px) {
      grid-template-columns: 1fr;
    }
  `,
  permissionGroup: css`
    display: grid;
    gap: 7px;

    h3 {
      margin: 0;
      color: ${token.colorTextSecondary};
      font-size: ${token.fontSizeSM}px;
      font-weight: 600;
    }
  `,
  permissionItem: css`
    display: flex;
    align-items: center;
    gap: 7px;
    color: ${token.colorTextDisabled};
    font-size: ${token.fontSizeSM}px;

    &[data-active="true"] {
      color: ${token.colorText};
    }

    &[data-active="true"] .anticon {
      color: ${token.colorPrimary};
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
  roles: Array<{
    id: string;
    name: string;
    permissions: AdminPermission[];
    systemKey: AdminSystemRoleKey | null;
  }>;
}

interface PendingConfirmation {
  confirmText: string;
  description: string;
  run: () => Promise<void>;
  title: string;
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
  "announcements.read": "permission.announcements.read",
  "announcements.manage": "permission.announcements.manage",
  "ai.providers.manage": "permission.ai.providers.manage",
  "ai.quotas.manage": "permission.ai.quotas.manage",
  "ai.usage.read": "permission.ai.usage.read",
  "ai.audit.sensitive.read": "permission.ai.audit.sensitive.read",
  "audit.read": "permission.audit.read",
  "system.read": "permission.system.read",
  "configuration.read": "permission.configuration.read",
  "configuration.edit": "permission.configuration.edit",
  "configuration.publish": "permission.configuration.publish",
  "configuration.history": "permission.configuration.history",
  "configuration.rollback": "permission.configuration.rollback",
};

const permissionGroups: Array<{
  label: AdminMessageKey;
  permissions: AdminPermission[];
}> = [
  {
    label: "roles.permissionGroup.overview",
    permissions: ["overview.read"],
  },
  {
    label: "roles.permissionGroup.users",
    permissions: [
      "users.read",
      "users.invite",
      "users.suspend",
      "users.sessions.revoke",
    ],
  },
  {
    label: "roles.permissionGroup.resumes",
    permissions: [
      "resumes.metadata.read",
      "resumes.content.read",
      "resumes.unpublish",
    ],
  },
  {
    label: "roles.permissionGroup.exports",
    permissions: ["exports.read", "exports.cancel", "exports.retry"],
  },
  {
    label: "roles.permissionGroup.announcements",
    permissions: ["announcements.read", "announcements.manage"],
  },
  {
    label: "roles.permissionGroup.ai",
    permissions: [
      "ai.providers.manage",
      "ai.quotas.manage",
      "ai.usage.read",
      "ai.audit.sensitive.read",
    ],
  },
  {
    label: "roles.permissionGroup.audit",
    permissions: ["audit.read"],
  },
  {
    label: "roles.permissionGroup.system",
    permissions: ["system.read"],
  },
  {
    label: "roles.permissionGroup.configuration",
    permissions: [
      "configuration.read",
      "configuration.edit",
      "configuration.publish",
      "configuration.history",
      "configuration.rollback",
    ],
  },
];

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
  const { token } = theme.useToken();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<AdminPermission[]>([]);
  const [editingRoleId, setEditingRoleId] = useState<string>();
  const [grantOpen, setGrantOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>();
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loadedRoleOptions, setLoadedRoleOptions] = useState<AdminSelectOption[]>([]);
  const [roleEditorUser, setRoleEditorUser] = useState<UserSummary>();
  const [roleEditorIds, setRoleEditorIds] = useState<string[]>([]);
  const [viewingRole, setViewingRole] = useState<RoleSummary>();
  const [pending, setPending] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthCode, setReauthCode] = useState("");
  const [deferredAction, setDeferredAction] = useState<(() => Promise<void>) | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation>();

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
      setGrantOpen(false);
      setRoleEditorUser(undefined);
      setSelectedUser(undefined);
      setSelectedRoles([]);
      router.refresh();
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : t("common.operationFailed"),
      );
    } finally {
      setPending(false);
    }
  }

  function roleLabel(role: UserSummary["roles"][number]) {
    return role.systemKey
      ? getAdminSystemRolePresentation(t, role.systemKey).name
      : role.name;
  }

  function mergeRoleOptions(nextOptions: AdminSelectOption[]) {
    setLoadedRoleOptions((currentOptions) => {
      const merged = new Map(
        currentOptions.map((option) => [option.id, option]),
      );
      for (const option of nextOptions) merged.set(option.id, option);
      return [...merged.values()];
    });
  }

  const roleCatalog = new Map<string, AdminSelectOption>();
  for (const role of roles.items) {
    roleCatalog.set(role.id, {
      id: role.id,
      label: role.systemKey
        ? getAdminSystemRolePresentation(t, role.systemKey).name
        : role.name,
      permissions: role.permissions,
    });
  }
  for (const option of loadedRoleOptions) roleCatalog.set(option.id, option);
  if (roleEditorUser) {
    for (const role of roleEditorUser.roles) {
      roleCatalog.set(role.id, {
        id: role.id,
        label: roleLabel(role),
        permissions: role.permissions,
      });
    }
  }

  function effectivePermissions(roleIds: string[]) {
    return ADMIN_PERMISSION_KEYS.filter((permission) =>
      roleIds.some((roleId) =>
        roleCatalog.get(roleId)?.permissions?.includes(permission),
      ),
    );
  }

  function permissionPreview(
    effective: AdminPermission[],
    title = t("roles.effectivePermissions"),
  ) {
    const effectiveSet = new Set(effective);

    return (
      <div className={styles.permissionPreview}>
        <div className={styles.permissionPreviewHeader}>
          <strong>{title}</strong>
          <span>{t("roles.permissionSummary", {
            selected: effective.length,
            total: ADMIN_PERMISSION_KEYS.length,
          })}</span>
        </div>
        <div className={styles.permissionGroups}>
          {permissionGroups.map((group) => (
            <section className={styles.permissionGroup} key={group.label}>
              <h3>{t(group.label)}</h3>
              {group.permissions.map((permission) => {
                const active = effectiveSet.has(permission);
                return (
                  <span
                    className={styles.permissionItem}
                    data-active={active}
                    key={permission}
                  >
                    {active ? <CheckCircleFilled /> : <MinusCircleOutlined />}
                    {t(permissionMessageKeys[permission])}
                  </span>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    );
  }

  function openRoleForm(role?: RoleSummary) {
    if (role?.systemKey) return;
    setEditingRoleId(role?.id);
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPermissions(role ? [...role.permissions] : []);
    setOpen(true);
  }

  function confirmAction(next: PendingConfirmation) {
    setConfirmation(next);
  }

  function executeConfirmedAction() {
    const action = confirmation?.run;
    setConfirmation(undefined);
    void action?.();
  }

  function saveRole() {
    const request = () => runAction(() => fetch(
      editingRoleId ? `/api/manage/roles/${editingRoleId}` : "/api/manage/roles",
      {
        method: editingRoleId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, permissions }),
      },
    ));
    const previous = editingRoleId
      ? roles.items.find((role) => role.id === editingRoleId)
      : undefined;
    const removedPermissions = previous?.permissions.filter(
      (permission) => !permissions.includes(permission),
    ) ?? [];
    if (removedPermissions.length === 0) {
      void request();
      return;
    }
    confirmAction({
      confirmText: t("roles.confirmSave"),
      description: t("roles.removePermissionsDescription", {
        permissions: removedPermissions
          .map((permission) => t(permissionMessageKeys[permission]))
          .join(locale === "zh-CN" ? "、" : ", "),
        role: previous?.name ?? name,
      }),
      run: request,
      title: t("roles.removePermissionsTitle"),
    });
  }

  function saveUserRoles() {
    if (!roleEditorUser) return;
    const user = roleEditorUser;
    const request = () => runAction(() => fetch("/api/manage/administrators", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.id, roleIds: roleEditorIds }),
    }));
    const removedRoles = user.roles.filter(
      (role) => !roleEditorIds.includes(role.id),
    );
    if (removedRoles.length === 0) {
      void request();
      return;
    }
    confirmAction({
      confirmText: t("roles.confirmSave"),
      description: t("roles.removeRolesDescription", {
        roles: removedRoles.map(roleLabel).join(locale === "zh-CN" ? "、" : ", "),
        user: user.name,
      }),
      run: request,
      title: t("roles.removeRolesTitle"),
    });
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
      <AdminSection
        actions={(
          <Button onClick={() => openRoleForm()} type="primary">
            {t("roles.create")}
          </Button>
        )}
        title={t("roles.role")}
      >
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
              role.systemKey ? (
                <AdminTableActions key="actions">
                  <Button
                    onClick={() => setViewingRole(role)}
                    type="link"
                  >
                    {t("common.details")}
                  </Button>
                </AdminTableActions>
              ) : (
                <AdminTableActions key="actions">
                  <Button
                    onClick={() => openRoleForm(role)}
                    type="link"
                  >{t("common.edit")}</Button>
                  <Button
                    danger
                    disabled={role.members > 0}
                    loading={pending}
                    onClick={() => confirmAction({
                      confirmText: t("roles.deleteConfirm"),
                      description: t("roles.deleteDescription", { role: roleName }),
                      run: () => runAction(() => fetch(`/api/manage/roles/${role.id}`, { method: "DELETE" })),
                      title: t("roles.deleteTitle"),
                    })}
                    type="link"
                  >{t("common.delete")}</Button>
                </AdminTableActions>
              ),
            ];
          })}
        />
      </AdminSection>

      <AdminSection
        actions={(
          <Button onClick={() => setGrantOpen(true)} type="primary">
            {t("roles.authorize")}
          </Button>
        )}
        title={t("roles.authorized")}
      >
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
            user.roles.length > 0 ? (
              <div className={styles.roleList} key="roles">
                {user.roles.map((role) => (
                  <Tag key={role.id}>{roleLabel(role)}</Tag>
                ))}
              </div>
            ) : t("roles.unassigned"),
            <AdminTableActions key="actions">
              <Button
                onClick={() => {
                  setRoleEditorUser(user);
                  setRoleEditorIds(user.roles.map((role) => role.id));
                }}
                type="link"
              >{t("roles.manage")}</Button>
              <Button
                danger
                loading={pending}
                onClick={() => confirmAction({
                  confirmText: t("roles.removeAdminConfirm"),
                  description: t("roles.removeAdminDescription", { user: user.name }),
                  run: () => runAction(() => fetch("/api/manage/administrators", {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ userId: user.id }),
                  })),
                  title: t("roles.removeAdminTitle"),
                })}
                type="link"
              >{t("roles.removeAdmin")}</Button>
            </AdminTableActions>,
          ])}
        />
      </AdminSection>

      <Modal
        cancelText={t("common.cancel")}
        destroyOnHidden
        okButtonProps={{
          disabled: !selectedUser || selectedRoles.length === 0,
          loading: pending,
        }}
        okText={t("roles.authorize")}
        onCancel={() => {
          setGrantOpen(false);
          setSelectedUser(undefined);
          setSelectedRoles([]);
        }}
        onOk={() => {
          if (!selectedUser || selectedRoles.length === 0) return;
          void runAction(() => fetch("/api/manage/administrators", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              userId: selectedUser,
              roleIds: selectedRoles,
            }),
          }));
        }}
        open={grantOpen}
        title={t("roles.authorizeTitle")}
        width={720}
      >
        <div className="admin-dialog-form">
          <AdminPagedSelect
            endpoint="/api/manage/users"
            onChange={setSelectedUser}
            placeholder={t("roles.selectUser")}
            value={selectedUser}
          />
          <AdminPagedSelect
            endpoint="/api/manage/roles"
            initialOptions={[...roleCatalog.values()]}
            mode="multiple"
            onChange={setSelectedRoles}
            onOptionsChange={mergeRoleOptions}
            placeholder={t("roles.selectRole")}
            value={selectedRoles}
          />
          {permissionPreview(effectivePermissions(selectedRoles))}
        </div>
      </Modal>

      <Modal
        cancelText={t("common.cancel")}
        destroyOnHidden
        okButtonProps={{ loading: pending }}
        okText={t("roles.saveAssignments")}
        onCancel={() => setRoleEditorUser(undefined)}
        onOk={saveUserRoles}
        open={Boolean(roleEditorUser)}
        title={t("roles.manageTitle")}
        width={720}
      >
        {roleEditorUser ? (
          <div className="admin-dialog-form">
            <AdminIdentity
              description={roleEditorUser.email}
              title={roleEditorUser.name}
            />
            <AdminPagedSelect
              endpoint="/api/manage/roles"
              initialOptions={roleEditorUser.roles.map((role) => ({
                id: role.id,
                label: roleLabel(role),
                permissions: role.permissions,
              }))}
              mode="multiple"
              onChange={setRoleEditorIds}
              onOptionsChange={mergeRoleOptions}
              placeholder={t("roles.selectRole")}
              value={roleEditorIds}
            />
            {permissionPreview(effectivePermissions(roleEditorIds))}
          </div>
        ) : null}
      </Modal>

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
            saveRole();
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
        footer={(
          <Button onClick={() => setViewingRole(undefined)}>
            {t("common.close")}
          </Button>
        )}
        onCancel={() => setViewingRole(undefined)}
        open={Boolean(viewingRole)}
        title={t("roles.detailsTitle")}
        width={720}
      >
        {viewingRole ? (
          <div className="admin-dialog-form">
            <AdminIdentity
              description={viewingRole.systemKey
                ? getAdminSystemRolePresentation(t, viewingRole.systemKey).description
                : viewingRole.description}
              title={viewingRole.systemKey
                ? getAdminSystemRolePresentation(t, viewingRole.systemKey).name
                : viewingRole.name}
            />
            {permissionPreview(viewingRole.permissions, t("roles.permissions"))}
          </div>
        ) : null}
      </Modal>

      <ActionConfirmationModal
        cancelText={t("common.cancel")}
        confirmText={confirmation?.confirmText ?? t("common.confirm")}
        description={confirmation?.description ?? ""}
        onCancel={() => setConfirmation(undefined)}
        onConfirm={executeConfirmedAction}
        open={Boolean(confirmation)}
        pending={pending}
        title={confirmation?.title ?? ""}
      />

      <Modal
        cancelText={t("common.cancel")}
        okButtonProps={{ disabled: reauthCode.length !== 6, loading: pending }}
        okText={t("common.verify")}
        onCancel={() => setReauthOpen(false)}
        onOk={reauthenticate}
        open={reauthOpen}
        title={t("common.reauthTitle")}
        zIndex={token.zIndexPopupBase + 100}
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
