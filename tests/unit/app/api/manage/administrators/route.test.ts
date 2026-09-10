import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  setRoles: vi.fn(),
}));

vi.mock("@/lib/admin/api", () => ({
  adminApiErrorResponse: () => null,
  requireAdminApi: mocks.requireAdmin,
}));

vi.mock("@/lib/admin/management", () => ({
  AdminManagementConflictError: class extends Error {},
  AdminManagementNotFoundError: class extends Error {},
  removeDelegatedAdmin: vi.fn(),
  setAdminRoles: mocks.setRoles,
}));

import { PUT } from "@/app/api/manage/administrators/route";

describe("management administrator route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: "super-admin" });
    mocks.setRoles.mockResolvedValue(undefined);
  });

  it("synchronizes the complete role set", async () => {
    const roleIds = [
      "82fbfc7d-d0e0-4234-890f-35929e745e72",
      "af449912-0c0e-4516-a513-f93b3fba1cf7",
    ];
    const response = await PUT(new Request(
      "http://localhost/api/manage/administrators",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "user-1", roleIds }),
      },
    ));

    expect(response.status).toBe(200);
    expect(mocks.setRoles).toHaveBeenCalledWith({
      actorUserId: "super-admin",
      userId: "user-1",
      roleIds,
    });
  });

  it("rejects singular-role payloads", async () => {
    const response = await PUT(new Request(
      "http://localhost/api/manage/administrators",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "user-1",
          roleId: "82fbfc7d-d0e0-4234-890f-35929e745e72",
        }),
      },
    ));

    expect(response.status).toBe(400);
    expect(mocks.setRoles).not.toHaveBeenCalled();
  });
});
