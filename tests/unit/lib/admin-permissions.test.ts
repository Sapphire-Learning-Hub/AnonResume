import {
  ADMIN_PERMISSION_KEYS,
  ADMIN_ROLE_PRESETS,
  isAdminPermission,
  normalizeAdminPermissions,
} from "@/lib/admin-permissions";

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

  it("provides immutable least-privilege role presets", () => {
    expect(Object.keys(ADMIN_ROLE_PRESETS)).toEqual([
      "read_only_auditor",
      "support_operator",
      "content_reviewer",
      "system_operator",
    ]);

    for (const preset of Object.values(ADMIN_ROLE_PRESETS)) {
      expect(preset.permissions.every(isAdminPermission)).toBe(true);
      expect(new Set(preset.permissions).size).toBe(preset.permissions.length);
    }

    expect(ADMIN_ROLE_PRESETS.read_only_auditor.permissions).not.toContain(
      "resumes.content.read",
    );
    expect(ADMIN_ROLE_PRESETS.support_operator.permissions).not.toContain(
      "users.invite",
    );
  });
});
