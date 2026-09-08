import {
  AdminAuthenticationError,
  AdminPermissionError,
  AdminReauthenticationRequiredError,
  authorizeAdminRequest,
  requireAdminPermission,
  requireRecentAdminReauthentication,
  type AdminAuthorizationStore,
} from "@/lib/admin-authorization";

const now = new Date("2026-09-08T10:00:00.000Z");

function createStore(
  overrides: Partial<AdminAuthorizationStore> = {},
): AdminAuthorizationStore {
  return {
    findSessionByTokenHash: vi.fn(async () => ({
      id: "admin-session",
      userId: "user-1",
      baseSessionId: "base-session",
      accessVersion: 2,
      idleExpiresAt: new Date(now.getTime() + 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 120_000),
      reauthenticatedAt: now,
      revokedAt: null,
    })),
    getAccess: vi.fn(async () => ({
      kind: "delegated_admin" as const,
      accessVersion: 2,
      permissions: ["users.read" as const],
      recoveryRequired: false,
    })),
    touchSession: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("admin dual-token authorization", () => {
  it("requires the management token to match the base identity and session", async () => {
    const context = await authorizeAdminRequest({
      store: createStore(),
      baseSession: { userId: "user-1", sessionId: "base-session" },
      rawAdminToken: "admin-token",
      now,
      idleSeconds: 1800,
    });

    expect(context.permissions).toEqual(["users.read"]);
  });

  it("rejects a token copied to another base session", async () => {
    await expect(
      authorizeAdminRequest({
        store: createStore(),
        baseSession: { userId: "user-1", sessionId: "other-session" },
        rawAdminToken: "admin-token",
        now,
        idleSeconds: 1800,
      }),
    ).rejects.toBeInstanceOf(AdminAuthenticationError);
  });

  it("rejects stale role versions immediately", async () => {
    const store = createStore({
      getAccess: vi.fn(async () => ({
        kind: "delegated_admin" as const,
        accessVersion: 3,
        permissions: ["users.read" as const],
        recoveryRequired: false,
      })),
    });

    await expect(
      authorizeAdminRequest({
        store,
        baseSession: { userId: "user-1", sessionId: "base-session" },
        rawAdminToken: "admin-token",
        now,
        idleSeconds: 1800,
      }),
    ).rejects.toBeInstanceOf(AdminAuthenticationError);
  });

  it("enforces grantable permissions while super-admin bypass remains explicit", () => {
    expect(() =>
      requireAdminPermission(
        {
          kind: "delegated_admin",
          permissions: ["users.read"],
        },
        "users.suspend",
      ),
    ).toThrow(AdminPermissionError);

    expect(() =>
      requireAdminPermission(
        { kind: "super_admin", permissions: [] },
        "users.suspend",
      ),
    ).not.toThrow();
  });

  it("requires fresh TOTP for high-risk operations", () => {
    expect(() =>
      requireRecentAdminReauthentication(
        { reauthenticatedAt: new Date(now.getTime() - 301_000) },
        now,
        300,
      ),
    ).toThrow(AdminReauthenticationRequiredError);
  });

  it("uses the recovery-authenticated session to enroll replacement MFA", () => {
    expect(() =>
      requireRecentAdminReauthentication(
        {
          reauthenticatedAt: new Date(now.getTime() - 301_000),
          recoveryRequired: true,
        },
        now,
        300,
        { allowRecoveryEnrollment: true },
      ),
    ).not.toThrow();
  });

  it("does not relax MFA freshness outside recovery mode", () => {
    expect(() =>
      requireRecentAdminReauthentication(
        {
          reauthenticatedAt: new Date(now.getTime() - 301_000),
          recoveryRequired: false,
        },
        now,
        300,
        { allowRecoveryEnrollment: true },
      ),
    ).toThrow(AdminReauthenticationRequiredError);
  });
});
