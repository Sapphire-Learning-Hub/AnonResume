import { resolveAppShellAccess } from "@/lib/auth/app-shell-access";

describe("app shell access", () => {
  it("keeps product-only identities in product mode", () => {
    expect(
      resolveAppShellAccess({
        activeManagement: null,
        assignedManagement: null,
        productAccess: true,
      }),
    ).toEqual({
      canEnterManagement: false,
      mfaEnrollmentRequired: false,
      mode: "product",
      productAccess: true,
    });
  });

  it("lets delegated administrators enter management from product mode", () => {
    expect(
      resolveAppShellAccess({
        activeManagement: null,
        assignedManagement: { kind: "delegated_admin", mfaConfigured: true },
        productAccess: true,
      }),
    ).toEqual({
      canEnterManagement: true,
      mfaEnrollmentRequired: false,
      mode: "product",
      productAccess: true,
    });
  });

  it("requires first-time MFA enrollment for a delegated administrator without a device", () => {
    expect(
      resolveAppShellAccess({
        activeManagement: null,
        assignedManagement: {
          kind: "delegated_admin",
          mfaConfigured: false,
        },
        productAccess: true,
      }),
    ).toEqual({
      canEnterManagement: true,
      mfaEnrollmentRequired: true,
      mode: "product",
      productAccess: true,
    });
  });

  it("represents active management and recovery as distinct modes", () => {
    expect(
      resolveAppShellAccess({
        activeManagement: {
          kind: "delegated_admin",
          permissions: ["overview.read", "users.read"],
          recoveryRequired: false,
        },
        assignedManagement: { kind: "delegated_admin", mfaConfigured: true },
        productAccess: true,
      }),
    ).toEqual({
      kind: "delegated_admin",
      mode: "management",
      permissions: ["overview.read", "users.read"],
      productAccess: true,
    });

    expect(
      resolveAppShellAccess({
        activeManagement: {
          kind: "super_admin",
          permissions: ["overview.read"],
          recoveryRequired: true,
        },
        assignedManagement: { kind: "super_admin", mfaConfigured: true },
        productAccess: false,
      }),
    ).toEqual({
      kind: "super_admin",
      mode: "recovery",
      productAccess: false,
    });
  });

  it("rejects a management-only identity without an active management session", () => {
    expect(() =>
      resolveAppShellAccess({
        activeManagement: null,
        assignedManagement: { kind: "super_admin", mfaConfigured: true },
        productAccess: false,
      }),
    ).toThrow("Management-only identity requires management authentication");
  });
});
