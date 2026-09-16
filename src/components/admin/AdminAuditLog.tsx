"use client";

import { Button, Modal } from "antd";
import { useState, type ReactNode } from "react";

import {
  AdminIdentity,
  AdminStatus,
  AdminTable,
  AdminTableActions,
} from "@/components/admin/AdminPage";
import {
  createAdminTranslator,
  type AdminMessageKey,
} from "@/i18n/admin-messages";
import type { AppLocale } from "@/i18n/messages";
import type {
  AdminAuditEvent,
  AdminAuditResource,
} from "@/lib/admin/query";
import type { PaginationSearchParams } from "@/lib/shared/pagination";

type SerializedAuditEvent = Omit<AdminAuditEvent, "createdAt"> & {
  createdAt: string;
};

const actionMessageKeys: Record<string, AdminMessageKey> = {
  "authorization.denied": "audit.action.authorization.denied",
  "reauthentication.required": "audit.action.reauthentication.required",
  "role.create": "audit.action.role.create",
  "role.update": "audit.action.role.update",
  "role.delete": "audit.action.role.delete",
  "administrator.set_roles": "audit.action.administrator.set_roles",
  "administrator.remove": "audit.action.administrator.remove",
  "user.invite": "audit.action.user.invite",
  "user.suspend": "audit.action.user.suspend",
  "user.restore": "audit.action.user.restore",
  "user.sessions.revoke": "audit.action.user.sessions.revoke",
  "resume.content.read": "audit.action.resume.content.read",
  "resume.unpublish": "audit.action.resume.unpublish",
  "export.cancel": "audit.action.export.cancel",
  "export.retry": "audit.action.export.retry",
  "announcement.create": "audit.action.announcement.create",
  "announcement.update": "audit.action.announcement.update",
  "announcement.publish": "audit.action.announcement.publish",
  "announcement.withdraw": "audit.action.announcement.withdraw",
  "announcement.delete": "audit.action.announcement.delete",
  "mfa.device.add": "audit.action.mfa.device.add",
  "mfa.device.remove": "audit.action.mfa.device.remove",
  "administrator.mfa_reset.request": "audit.action.administrator.mfa_reset.request",
  "administrator.mfa_reset.cancel": "audit.action.administrator.mfa_reset.cancel",
  "administrator.mfa_reset.approved": "audit.action.administrator.mfa_reset.approved",
  "administrator.mfa_reset.rejected": "audit.action.administrator.mfa_reset.rejected",
  "super_admin.repair": "audit.action.super_admin.repair",
  "super_admin.mfa_reset": "audit.action.super_admin.mfa_reset",
};

const targetMessageKeys: Record<string, AdminMessageKey> = {
  user: "audit.target.user",
  admin_identity: "audit.target.admin_identity",
  admin_role: "audit.target.admin_role",
  resume: "audit.target.resume",
  pdf_export: "audit.target.pdf_export",
  announcement: "audit.target.announcement",
  mfa_device: "audit.target.mfa_device",
  admin_mfa_reset_request: "audit.target.admin_mfa_reset_request",
  admin_session: "audit.target.admin_session",
  permission: "audit.target.permission",
  super_admin_capability: "audit.target.super_admin_capability",
};

const fieldMessageKeys: Record<string, AdminMessageKey> = {
  name: "audit.field.name",
  titleZh: "audit.field.titleZh",
  bodyZh: "audit.field.bodyZh",
  titleEn: "audit.field.titleEn",
  bodyEn: "audit.field.bodyEn",
  tone: "audit.field.tone",
  audience: "audit.field.audience",
  dismissible: "audit.field.dismissible",
  expiresAt: "audit.field.expiresAt",
  description: "audit.field.description",
  permissions: "audit.field.permissions",
  roleIds: "audit.field.roleIds",
  status: "audit.field.status",
  suspendedUntil: "audit.field.suspendedUntil",
  reason: "audit.field.reason",
  published: "audit.field.published",
  cancelRequested: "audit.field.cancelRequested",
  activeProductSessions: "audit.field.activeProductSessions",
  activeAdminSessions: "audit.field.activeAdminSessions",
  verified: "audit.field.verified",
  reviewReason: "audit.field.reviewReason",
  mfaState: "audit.field.mfaState",
  activeSuperAdminIds: "audit.field.activeSuperAdminIds",
};

const permissionMessageKeys: Record<string, AdminMessageKey> = {
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
};

const statusMessageKeys: Record<string, AdminMessageKey> = {
  active: "audit.value.status.active",
  draft: "announcements.status.draft",
  published: "announcements.status.published",
  withdrawn: "announcements.status.withdrawn",
  suspended: "audit.value.status.suspended",
  invited: "audit.value.status.invited",
  pending: "audit.value.status.pending",
  approved: "audit.value.status.approved",
  rejected: "audit.value.status.rejected",
  expired: "audit.value.status.expired",
  queued: "audit.value.status.queued",
  running: "audit.value.status.running",
  completed: "audit.value.status.completed",
  failed: "audit.value.status.failed",
  cancelled: "audit.value.status.cancelled",
};

const mfaStateMessageKeys: Record<string, AdminMessageKey> = {
  configured: "audit.value.mfa.configured",
  recovery_required: "audit.value.mfa.recoveryRequired",
};

const announcementToneMessageKeys: Record<string, AdminMessageKey> = {
  info: "announcements.tone.info",
  warning: "announcements.tone.warning",
  critical: "announcements.tone.critical",
};

const announcementAudienceMessageKeys: Record<string, AdminMessageKey> = {
  all: "announcements.audience.all",
  authenticated: "announcements.audience.authenticated",
};

function outcomeTone(outcome: string) {
  if (outcome === "success") return "success" as const;
  if (outcome === "denied") return "warning" as const;
  return "danger" as const;
}

function referenceType(field: string) {
  if (field === "roleIds" || field === "roleId") return "admin_role";
  if (field.toLowerCase().includes("userid")) return "user";
  if (field === "retriedJobId" || field === "jobId") return "pdf_export";
  if (field === "deviceId") return "mfa_device";
  return null;
}

function MappedResourceValue({ resource }: { resource: AdminAuditResource }) {
  return (
    <span className="admin-audit-resource-value">
      <strong>{resource.label}</strong>
      <code>{resource.id}</code>
    </span>
  );
}

export function AdminAuditLog({
  events,
  locale,
  searchParams,
}: {
  events: {
    items: SerializedAuditEvent[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  locale: AppLocale;
  searchParams: PaginationSearchParams;
}) {
  const t = createAdminTranslator(locale);
  const [selected, setSelected] = useState<SerializedAuditEvent>();

  function actionLabel(action: string) {
    const key = actionMessageKeys[action];
    return key ? t(key) : action;
  }

  function targetTypeLabel(type: string) {
    const key = targetMessageKeys[type];
    return key ? t(key) : type;
  }

  function targetLabel(event: SerializedAuditEvent) {
    const permissionKey = event.targetType === "permission" && event.targetId
      ? permissionMessageKeys[event.targetId]
      : undefined;
    return permissionKey ? t(permissionKey) : event.target.label;
  }

  function outcomeLabel(outcome: string) {
    const key = `audit.outcome.${outcome}` as AdminMessageKey;
    return outcome === "success" || outcome === "denied" || outcome === "failed"
      ? t(key)
      : outcome;
  }

  function fieldLabel(field: string) {
    if (selected?.action.startsWith("role.")) {
      if (field === "name") return t("roles.name");
      if (field === "description") return t("roles.description");
      if (field === "permissions") return t("roles.permissions");
    }
    const key = fieldMessageKeys[field];
    return key ? t(key) : field;
  }

  function renderValue(value: unknown, field: string): ReactNode {
    if (value === null || value === undefined || value === "") {
      return t("audit.emptyValue");
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return t("audit.emptyValue");
      return (
        <span className="admin-audit-value-list">
          {value.map((item, index) => (
            <span key={`${String(item)}-${index}`}>
              {renderValue(item, field)}
            </span>
          ))}
        </span>
      );
    }
    if (typeof value === "boolean") {
      if (field === "published") {
        return t(value
          ? "audit.value.publication.published"
          : "audit.value.publication.unpublished");
      }
      if (field === "verified") {
        return t(value
          ? "audit.value.verification.verified"
          : "audit.value.verification.unverified");
      }
      if (field === "cancelRequested") {
        return t(value
          ? "audit.value.cancellation.requested"
          : "audit.value.cancellation.notRequested");
      }
      return t(value ? "audit.value.boolean.yes" : "audit.value.boolean.no");
    }
    if (typeof value === "number") return value.toLocaleString(locale);
    if (typeof value === "string") {
      const semanticValueKey = field === "status"
        ? statusMessageKeys[value]
        : field === "tone"
          ? announcementToneMessageKeys[value]
          : field === "audience"
            ? announcementAudienceMessageKeys[value]
        : field === "mfaState"
          ? mfaStateMessageKeys[value]
          : undefined;
      if (semanticValueKey) {
        return (
          <span className="admin-audit-resource-value">
            <strong>{t(semanticValueKey)}</strong>
            <code>{value}</code>
          </span>
        );
      }
      const type = referenceType(field);
      const resource = type && selected
        ? selected.resourceLabels[`${type}:${value}`]
        : undefined;
      if (resource) return <MappedResourceValue resource={resource} />;
      const permissionKey = field === "permissions"
        ? permissionMessageKeys[value]
        : undefined;
      if (permissionKey) {
        return (
          <span className="admin-audit-resource-value">
            <strong>{t(permissionKey)}</strong>
            <code>{value}</code>
          </span>
        );
      }
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return `${new Date(value).toLocaleString(locale)} (${value})`;
      }
      return value;
    }
    return <code>{JSON.stringify(value)}</code>;
  }

  const changes = selected && Array.isArray(selected.metadata.changes)
    ? selected.metadata.changes.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const change = value as Record<string, unknown>;
        if (typeof change.field !== "string") return [];
        return [{
          field: change.field,
          before: change.before,
          after: change.after,
        }];
      })
    : [];

  return (
    <>
      <AdminTable
        actionColumn
        headers={[
          t("audit.action"),
          t("audit.actor"),
          t("audit.target"),
          t("audit.outcome"),
          t("audit.time"),
          t("common.actions"),
        ]}
        pagination={{
          basePath: "/app/manage/audit",
          page: events.page,
          pageSize: events.pageSize,
          searchParams,
          total: events.total,
          totalPages: events.totalPages,
        }}
        rows={events.items.map((event) => [
          <AdminIdentity
            description={event.action}
            key="action"
            title={actionLabel(event.action)}
          />,
          event.actor ? (
            <AdminIdentity
              description={`${event.actor.description ?? ""} · ${event.actor.id}`}
              key="actor"
              title={event.actor.label}
            />
          ) : t("audit.system"),
          <AdminIdentity
            description={`${targetTypeLabel(event.targetType)}${event.targetId ? ` · ${event.targetId}` : ""}`}
            key="target"
            title={targetLabel(event)}
          />,
          <AdminStatus key="outcome" tone={outcomeTone(event.outcome)}>
            {outcomeLabel(event.outcome)}
          </AdminStatus>,
          new Date(event.createdAt).toLocaleString(locale),
          <AdminTableActions key="actions">
            <Button onClick={() => setSelected(event)} type="link">
              {t("common.details")}
            </Button>
          </AdminTableActions>,
        ])}
      />

      <Modal
        footer={null}
        onCancel={() => setSelected(undefined)}
        open={Boolean(selected)}
        title={t("audit.detailTitle")}
        width={760}
      >
        {selected ? (
          <div className="admin-audit-details">
            <dl className="admin-detail-list">
              <div>
                <dt>{t("audit.action")}</dt>
                <dd>{actionLabel(selected.action)}</dd>
              </div>
              <div>
                <dt>{t("audit.actor")}</dt>
                <dd>{selected.actor?.label ?? t("audit.system")}</dd>
              </div>
              <div>
                <dt>{t("audit.target")}</dt>
                <dd>{targetLabel(selected)}</dd>
              </div>
              <div>
                <dt>{t("audit.outcome")}</dt>
                <dd>
                  <AdminStatus tone={outcomeTone(selected.outcome)}>
                    {outcomeLabel(selected.outcome)}
                  </AdminStatus>
                </dd>
              </div>
              <div>
                <dt>{t("audit.time")}</dt>
                <dd>{new Date(selected.createdAt).toLocaleString(locale)}</dd>
              </div>
            </dl>

            <section className="admin-audit-change-section">
              <h3>{t("audit.changeDetails")}</h3>
              {changes.length > 0 ? (
                <div className="admin-audit-change-list">
                  {changes.map((change) => (
                    <article key={change.field}>
                      <h4>{fieldLabel(change.field)}</h4>
                      <div>
                        <span>{t("audit.before")}</span>
                        <div>{renderValue(change.before, change.field)}</div>
                      </div>
                      <div>
                        <span>{t("audit.after")}</span>
                        <div>{renderValue(change.after, change.field)}</div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="admin-dialog-description">{t("audit.noChanges")}</p>
              )}
            </section>

            <details className="admin-audit-raw">
              <summary>{t("audit.rawData")}</summary>
              <dl className="admin-detail-list">
                <div>
                  <dt>{t("audit.rawAction")}</dt>
                  <dd><code>{selected.action}</code></dd>
                </div>
                <div>
                  <dt>{t("audit.rawTargetType")}</dt>
                  <dd><code>{selected.targetType}</code></dd>
                </div>
                <div>
                  <dt>{t("audit.rawTargetId")}</dt>
                  <dd><code>{selected.targetId ?? t("audit.emptyValue")}</code></dd>
                </div>
                <div>
                  <dt>{t("audit.requestId")}</dt>
                  <dd><code>{selected.requestId ?? t("audit.emptyValue")}</code></dd>
                </div>
                <div>
                  <dt>{t("audit.ipHash")}</dt>
                  <dd><code>{selected.ipHash ?? t("audit.emptyValue")}</code></dd>
                </div>
                <div>
                  <dt>{t("audit.metadata")}</dt>
                  <dd><pre>{JSON.stringify(selected.metadata, null, 2)}</pre></dd>
                </div>
              </dl>
            </details>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
