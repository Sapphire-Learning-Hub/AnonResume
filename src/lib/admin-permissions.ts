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
  "audit.read",
  "system.read",
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

export type AdminRolePresetKey = keyof typeof ADMIN_ROLE_PRESETS;

export interface AdminRolePreset {
  name: string;
  description: string;
  permissions: readonly AdminPermission[];
}

export const ADMIN_ROLE_PRESETS = {
  read_only_auditor: {
    name: "只读审计员",
    description: "查看系统概览、用户与审计记录，不读取简历正文。",
    permissions: [
      "overview.read",
      "users.read",
      "resumes.metadata.read",
      "exports.read",
      "audit.read",
      "system.read",
    ],
  },
  support_operator: {
    name: "支持专员",
    description: "处理用户状态、会话与导出队列，不读取简历正文。",
    permissions: [
      "overview.read",
      "users.read",
      "users.suspend",
      "users.sessions.revoke",
      "resumes.metadata.read",
      "exports.read",
      "exports.cancel",
      "exports.retry",
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
    description: "查看系统与导出队列状态，并处理失败或积压任务。",
    permissions: [
      "overview.read",
      "exports.read",
      "exports.cancel",
      "exports.retry",
      "audit.read",
      "system.read",
    ],
  },
} as const satisfies Record<string, AdminRolePreset>;
