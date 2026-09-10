import {
  getAdminSessionClearCookieOptions,
  getAdminSessionCookieOptions,
} from "@/lib/admin/request";

describe("admin session cookie options", () => {
  it("makes the independent management cookie available to pages and APIs", () => {
    const issued = getAdminSessionCookieOptions(28_800);
    const cleared = getAdminSessionClearCookieOptions();

    expect(issued).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 28_800,
    });
    expect(cleared).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    expect(cleared.expires.getTime()).toBe(0);
  });
});
