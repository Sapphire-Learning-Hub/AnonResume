import {
  resolveAdminSecurityConfiguration,
  resolveAdminSuperAdminEmail,
} from "@/lib/admin/configuration";
import { getManagedConfigDefaults } from "@/lib/config/registry";

describe("admin configuration", () => {
  it("uses bounded development defaults for session lifetimes", () => {
    expect(
      resolveAdminSecurityConfiguration(getManagedConfigDefaults()),
    ).toEqual({
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
        ...getManagedConfigDefaults(),
        adminSessionIdleSeconds: 3600,
        adminSessionMaxSeconds: 1800,
      }),
    ).toThrow("adminSessionIdleSeconds");
  });
});
