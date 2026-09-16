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

  it("defines the four immutable system roles", () => {
    expect(Object.keys(ADMIN_SYSTEM_ROLES)).toEqual([
      "read_only_auditor",
      "support_operator",
      "content_reviewer",
      "system_operator",
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
    expect(ADMIN_SYSTEM_ROLES.support_operator.permissions).toContain(
      "announcements.read",
    );
    expect(ADMIN_SYSTEM_ROLES.content_reviewer.permissions).not.toContain(
      "announcements.read",
    );
    expect(ADMIN_SYSTEM_ROLES.system_operator.permissions).toEqual(
      expect.arrayContaining([
        "announcements.read",
        "announcements.manage",
        "ai.providers.manage",
        "ai.quotas.manage",
        "ai.usage.read",
      ]),
    );
    for (const role of Object.values(ADMIN_SYSTEM_ROLES)) {
      expect(role.permissions).not.toContain("ai.audit.sensitive.read");
    }
  });
});
