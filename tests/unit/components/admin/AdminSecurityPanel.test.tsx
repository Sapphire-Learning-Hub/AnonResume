import { getAdminSecurityResponseAction } from "@/components/admin/AdminSecurityPanel";

describe("AdminSecurityPanel response handling", () => {
  it("returns to management verification when the recovery session expires", () => {
    expect(getAdminSecurityResponseAction(401, "unauthorized")).toBe("verify");
  });

  it("only opens the TOTP reauthentication dialog for a freshness challenge", () => {
    expect(getAdminSecurityResponseAction(428)).toBe("reauthenticate");
    expect(getAdminSecurityResponseAction(401, "invalid_code")).toBe("error");
    expect(getAdminSecurityResponseAction(500)).toBe("error");
  });
});
