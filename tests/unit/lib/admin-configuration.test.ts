import {
  resolveAdminSecurityConfiguration,
  resolveAdminSuperAdminEmail,
} from "@/lib/admin-configuration";

describe("admin configuration", () => {
  it("uses bounded development defaults for session lifetimes", () => {
    expect(resolveAdminSecurityConfiguration({})).toEqual({
      idleSeconds: 1800,
      maxSeconds: 28_800,
      reauthSeconds: 300,
      maxMfaDevices: 5,
      maxMfaFailures: 5,
      mfaLockSeconds: 900,
    });
  });

  it("normalizes the configured super-admin email", () => {
    expect(
      resolveAdminSuperAdminEmail({
        ANONRESUME_SUPER_ADMIN_EMAIL: " Owner@Example.COM ",
      }),
    ).toBe("owner@example.com");
  });

  it("rejects incoherent management session windows", () => {
    expect(() =>
      resolveAdminSecurityConfiguration({
        ADMIN_SESSION_IDLE_SECONDS: "3600",
        ADMIN_SESSION_MAX_SECONDS: "1800",
      }),
    ).toThrow("ADMIN_SESSION_IDLE_SECONDS");
  });
});
