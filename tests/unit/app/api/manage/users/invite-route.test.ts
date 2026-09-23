import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inviteUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/admin/api", () => ({
  adminApiErrorResponse: () => null,
  requireAdminApi: mocks.requireAdmin,
}));

vi.mock("@/lib/admin/invitations", () => ({
  AdminInvitationConflictError: class extends Error {},
  AdminInvitationNotFoundError: class extends Error {},
  inviteUser: mocks.inviteUser,
}));

import { POST } from "@/app/api/manage/users/invite/route";

describe("management invitation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      kind: "super_admin",
      userId: "super-admin-1",
    });
    mocks.inviteUser.mockResolvedValue({ userId: "invited-admin-1" });
  });

  it("requires super-admin access, recent MFA, and at least one role", async () => {
    const response = await POST(new Request("http://localhost/api/manage/users/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "New administrator",
        email: "admin@example.com",
        roleIds: ["00000000-0000-4000-8000-000000000001"],
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      recentMfa: true,
      superAdminOnly: true,
    });
    expect(mocks.inviteUser).toHaveBeenCalledWith({
      actorKind: "super_admin",
      actorUserId: "super-admin-1",
      email: "admin@example.com",
      name: "New administrator",
      roleIds: ["00000000-0000-4000-8000-000000000001"],
    });
  });

  it("rejects an invitation without a management role", async () => {
    const response = await POST(new Request("http://localhost/api/manage/users/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Product user",
        email: "user@example.com",
        roleIds: [],
      }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.inviteUser).not.toHaveBeenCalled();
  });
});
