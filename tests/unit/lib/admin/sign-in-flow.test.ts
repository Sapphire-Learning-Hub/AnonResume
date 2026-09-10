import { resolveAuthenticatedEntry } from "@/lib/admin/sign-in-flow";

describe("resolveAuthenticatedEntry", () => {
  it("routes product identities to the product workbench", () => {
    expect(
      resolveAuthenticatedEntry({
        activeManagement: null,
        assignedManagement: null,
        productAccess: true,
      }),
    ).toBe("/app");
    expect(
      resolveAuthenticatedEntry({
        activeManagement: null,
        assignedManagement: { kind: "delegated_admin" },
        productAccess: true,
      }),
    ).toBe("/app");
  });

  it("requires MFA before a super administrator enters management", () => {
    expect(
      resolveAuthenticatedEntry({
        activeManagement: null,
        assignedManagement: { kind: "super_admin" },
        productAccess: false,
      }),
    ).toBe("management_mfa");
  });

  it("routes active management sessions by recovery state", () => {
    expect(
      resolveAuthenticatedEntry({
        activeManagement: { recoveryRequired: false },
        assignedManagement: { kind: "super_admin" },
        productAccess: false,
      }),
    ).toBe("/app/manage");
    expect(
      resolveAuthenticatedEntry({
        activeManagement: { recoveryRequired: true },
        assignedManagement: { kind: "super_admin" },
        productAccess: false,
      }),
    ).toBe("/app/manage/security");
  });
});
