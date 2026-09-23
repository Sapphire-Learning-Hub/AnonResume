import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resendInvitation: vi.fn(),
}));

vi.mock("@/lib/admin/api", () => ({
  adminApiErrorResponse: () => null,
  requireAdminApi: mocks.requireAdmin,
}));

vi.mock("@/lib/admin/invitations", () => ({
  AdminInvitationConflictError: class extends Error {},
  AdminInvitationNotFoundError: class extends Error {},
  resendUserInvitation: mocks.resendInvitation,
}));

import { POST } from "@/app/api/manage/users/[id]/invitation/route";

describe("management invitation resend route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      kind: "super_admin",
      userId: "admin-1",
    });
    mocks.resendInvitation.mockResolvedValue({ userId: "user-1" });
  });

  it("requires super-admin access and recent MFA before resending", async () => {
    const response = await POST(
      new Request("http://localhost/api/manage/users/user-1/invitation", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "user-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      superAdminOnly: true,
      recentMfa: true,
    });
    expect(mocks.resendInvitation).toHaveBeenCalledWith({
      actorKind: "super_admin",
      actorUserId: "admin-1",
      userId: "user-1",
    });
  });
});
