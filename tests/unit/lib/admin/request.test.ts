const mocks = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  getIdentity: vi.fn(),
  getLifecycle: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalIdentitySession: mocks.getIdentity,
}));
vi.mock("@/lib/auth/account/repository", () => ({
  getAccountLifecycle: mocks.getLifecycle,
}));
vi.mock("@/lib/admin/authorization", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/admin/authorization")
  >();
  return {
    ...original,
    authorizeAdminRequest: mocks.authorizeAdminRequest,
  };
});

import {
  getAdminRequestContext,
  getAdminSessionClearCookieOptions,
  getAdminSessionCookieOptions,
} from "@/lib/admin/request";
import { AdminAuthenticationError } from "@/lib/admin/authorization";

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

describe("admin request lifecycle gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getIdentity.mockResolvedValue({
      session: { id: "base-session" },
      user: { id: "delegated-admin", email: "admin@example.com" },
    });
    mocks.getLifecycle.mockResolvedValue({ status: "active" });
  });

  it("rejects a management cookie while the account is pending deletion", async () => {
    mocks.getLifecycle.mockResolvedValue({ status: "pending_deletion" });

    await expect(getAdminRequestContext()).rejects.toBeInstanceOf(
      AdminAuthenticationError,
    );
    expect(mocks.authorizeAdminRequest).not.toHaveBeenCalled();
  });
});
