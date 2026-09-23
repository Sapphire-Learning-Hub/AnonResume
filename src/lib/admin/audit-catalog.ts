import type { AdminMessageKey } from "@/i18n/admin-messages";

export const adminAuditActionMessageKeys = {
  "authorization.denied": "audit.action.authorization.denied",
  "reauthentication.required": "audit.action.reauthentication.required",
  "role.create": "audit.action.role.create",
  "role.update": "audit.action.role.update",
  "role.delete": "audit.action.role.delete",
  "administrator.set_roles": "audit.action.administrator.set_roles",
  "administrator.remove": "audit.action.administrator.remove",
  "user.invite": "audit.action.user.invite",
  "user.invite.resend": "audit.action.user.invite.resend",
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
  "ai.provider.create": "audit.action.ai.provider.create",
  "ai.provider.update": "audit.action.ai.provider.update",
  "ai.provider.delete": "audit.action.ai.provider.delete",
  "ai.model.create": "audit.action.ai.model.create",
  "ai.model.update": "audit.action.ai.model.update",
  "ai.model.delete": "audit.action.ai.model.delete",
  "ai.quota.update": "audit.action.ai.quota.update",
  "ai.settlement.resolve": "audit.action.ai.settlement.resolve",
  "ai.audit_evidence.read": "audit.action.ai.auditEvidence.read",
  "configuration.draft.update": "audit.action.configuration.draft.update",
  "configuration.publish": "audit.action.configuration.publish",
  "configuration.rollback": "audit.action.configuration.rollback",
  "instance.setup.completed": "audit.action.instance.setup.completed",
  "instance.setup.deactivate": "audit.action.instance.setup.deactivate",
  "instance.admin_recovery.completed": "audit.action.instance.adminRecovery.completed",
} as const satisfies Record<string, AdminMessageKey>;

export const adminAuditTargetMessageKeys = {
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
  ai_provider: "audit.target.ai_provider",
  ai_model: "audit.target.ai_model",
  ai_run: "audit.target.ai_run",
  configuration_revision: "audit.target.configuration_revision",
  instance_setup: "audit.target.instance_setup",
} as const satisfies Record<string, AdminMessageKey>;

export type AdminAuditAction = keyof typeof adminAuditActionMessageKeys;
export type AdminAuditTargetType = keyof typeof adminAuditTargetMessageKeys;

export function getAdminAuditActionMessageKey(action: string) {
  return adminAuditActionMessageKeys[action as AdminAuditAction];
}

export function getAdminAuditTargetMessageKey(targetType: string) {
  return adminAuditTargetMessageKeys[targetType as AdminAuditTargetType];
}
