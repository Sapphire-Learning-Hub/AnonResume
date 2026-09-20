export const ADMIN_PERMISSION_KEYS = [
  "overview.read",
  "users.read",
  "users.invite",
  "users.suspend",
  "users.sessions.revoke",
  "resumes.metadata.read",
  "resumes.content.read",
  "resumes.unpublish",
  "exports.read",
  "exports.cancel",
  "exports.retry",
  "announcements.read",
  "announcements.manage",
  "ai.providers.manage",
  "ai.quotas.manage",
  "ai.usage.read",
  "ai.audit.sensitive.read",
  "audit.read",
  "system.read",
  "configuration.read",
  "configuration.edit",
  "configuration.publish",
  "configuration.history",
  "configuration.rollback",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSION_KEYS)[number];

const ADMIN_PERMISSION_SET: ReadonlySet<string> = new Set(
  ADMIN_PERMISSION_KEYS,
);

export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === "string" && ADMIN_PERMISSION_SET.has(value);
}

export function normalizeAdminPermissions(value: unknown): AdminPermission[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter(isAdminPermission))];
}

export const ADMIN_SYSTEM_ROLE_KEYS = [
  "read_only_auditor",
  "support_operator",
  "content_reviewer",
  "system_operator",
  "ai_service_manager",
] as const;

export type AdminSystemRoleKey = (typeof ADMIN_SYSTEM_ROLE_KEYS)[number];

export interface AdminSystemRoleDefinition {
  name: string;
  description: string;
  permissions: readonly AdminPermission[];
}

export const ADMIN_SYSTEM_ROLES = {
  read_only_auditor: {
    name: "只读审计员",
    description: "查看系统概览、用户、公告、AI 用量、平台配置历史与审计记录，不读取简历正文。",
    permissions: [
      "overview.read",
      "users.read",
      "resumes.metadata.read",
      "exports.read",
      "announcements.read",
      "ai.usage.read",
      "audit.read",
      "system.read",
      "configuration.read",
      "configuration.history",
    ],
  },
  support_operator: {
    name: "支持专员",
    description: "处理用户状态、会话与导出队列，并查看公告和 AI 用量，不读取简历正文。",
    permissions: [
      "overview.read",
      "users.read",
      "users.suspend",
      "users.sessions.revoke",
      "resumes.metadata.read",
      "exports.read",
      "exports.cancel",
      "exports.retry",
      "announcements.read",
      "ai.usage.read",
    ],
  },
  content_reviewer: {
    name: "内容审核员",
    description: "查看简历元数据和正文，并可撤回已公开简历。",
    permissions: [
      "overview.read",
      "users.read",
      "resumes.metadata.read",
      "resumes.content.read",
      "resumes.unpublish",
      "audit.read",
    ],
  },
  system_operator: {
    name: "系统运维员",
    description: "管理公告、AI 模型服务与平台配置，查看系统、AI 用量与导出队列状态。",
    permissions: [
      "overview.read",
      "exports.read",
      "exports.cancel",
      "exports.retry",
      "announcements.read",
      "announcements.manage",
      "ai.providers.manage",
      "ai.usage.read",
      "audit.read",
      "system.read",
      "configuration.read",
      "configuration.edit",
      "configuration.publish",
      "configuration.history",
      "configuration.rollback",
    ],
  },
  ai_service_manager: {
    name: "AI 服务管理员",
    description: "管理 AI 模型服务、用户额度与结算，并查看 AI 用量，不读取敏感请求内容。",
    permissions: [
      "overview.read",
      "ai.providers.manage",
      "ai.quotas.manage",
      "ai.usage.read",
    ],
  },
} as const satisfies Record<AdminSystemRoleKey, AdminSystemRoleDefinition>;

const ADMIN_SYSTEM_ROLE_KEY_SET: ReadonlySet<string> = new Set(
  ADMIN_SYSTEM_ROLE_KEYS,
);

export function isAdminSystemRoleKey(
  value: unknown,
): value is AdminSystemRoleKey {
  return (
    typeof value === "string" && ADMIN_SYSTEM_ROLE_KEY_SET.has(value)
  );
}
