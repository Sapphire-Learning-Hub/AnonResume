import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_SYSTEM_ROLES,
  isAdminPermission,
  normalizeAdminPermissions,
} from "@/lib/admin/permissions";

describe("admin permission catalog", () => {
  it("keeps the grantable permission set explicit and stable", () => {
    expect(ADMIN_PERMISSION_KEYS).toEqual([
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
    ]);
    expect(ADMIN_PERMISSION_KEYS).not.toContain("roles.manage");
    expect(ADMIN_PERMISSION_KEYS).not.toContain("administrators.manage");
  });

  it("normalizes persisted permissions without trusting unknown values", () => {
    expect(
      normalizeAdminPermissions([
        "users.read",
        "roles.manage",
        "users.read",
        "exports.read",
        12,
      ]),
    ).toEqual(["users.read", "exports.read"]);
    expect(normalizeAdminPermissions(null)).toEqual([]);
  });

  it("defines five immutable system roles with least-privilege AI access", () => {
    expect(Object.keys(ADMIN_SYSTEM_ROLES)).toEqual([
      "read_only_auditor",
      "support_operator",
      "content_reviewer",
      "system_operator",
      "ai_service_manager",
    ]);

    for (const role of Object.values(ADMIN_SYSTEM_ROLES)) {
      expect(role.permissions.every(isAdminPermission)).toBe(true);
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }

    expect(ADMIN_SYSTEM_ROLES.read_only_auditor.permissions).not.toContain(
      "resumes.content.read",
    );
    expect(ADMIN_SYSTEM_ROLES.support_operator.permissions).not.toContain(
      "users.invite",
    );
    expect(ADMIN_SYSTEM_ROLES.read_only_auditor.permissions).toContain(
      "announcements.read",
    );
    expect(ADMIN_SYSTEM_ROLES.read_only_auditor.permissions).toContain(
      "ai.usage.read",
    );
    expect(ADMIN_SYSTEM_ROLES.read_only_auditor.permissions).toEqual(
      expect.arrayContaining([
        "configuration.read",
        "configuration.history",
      ]),
    );
    expect(ADMIN_SYSTEM_ROLES.read_only_auditor.permissions).not.toEqual(
      expect.arrayContaining([
        "configuration.edit",
        "configuration.publish",
        "configuration.rollback",
      ]),
    );
    expect(ADMIN_SYSTEM_ROLES.support_operator.permissions).toContain(
      "announcements.read",
    );
    expect(ADMIN_SYSTEM_ROLES.support_operator.permissions).toContain(
      "ai.usage.read",
    );
    expect(ADMIN_SYSTEM_ROLES.content_reviewer.permissions).not.toContain(
      "announcements.read",
    );
    expect(ADMIN_SYSTEM_ROLES.system_operator.permissions).toEqual(
      expect.arrayContaining([
        "announcements.read",
        "announcements.manage",
        "ai.providers.manage",
        "ai.usage.read",
        "configuration.read",
        "configuration.edit",
        "configuration.publish",
        "configuration.history",
        "configuration.rollback",
      ]),
    );
    expect(ADMIN_SYSTEM_ROLES.system_operator.permissions).not.toContain(
      "ai.quotas.manage",
    );
    expect(ADMIN_SYSTEM_ROLES.ai_service_manager.permissions).toEqual([
      "overview.read",
      "ai.providers.manage",
      "ai.quotas.manage",
      "ai.usage.read",
    ]);
    for (const role of Object.values(ADMIN_SYSTEM_ROLES)) {
      expect(role.permissions).not.toContain("ai.audit.sensitive.read");
    }
    for (const role of [
      ADMIN_SYSTEM_ROLES.support_operator,
      ADMIN_SYSTEM_ROLES.content_reviewer,
      ADMIN_SYSTEM_ROLES.ai_service_manager,
    ]) {
      expect(role.permissions.some((permission) =>
        permission.startsWith("configuration."),
      )).toBe(false);
    }
  });
});
