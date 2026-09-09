import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listRoles: vi.fn(),
  listUsers: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/admin-api", () => ({
  adminApiErrorResponse: () => null,
  requireAdminApi: mocks.requireAdmin,
}));

vi.mock("@/lib/admin-query", () => ({
  listAdminRoles: mocks.listRoles,
  listAssignableAdminUsers: mocks.listUsers,
}));

vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve("zh-CN"),
}));

vi.mock("@/lib/admin-management", () => ({
  AdminManagementConflictError: class extends Error {},
  createAdminRole: vi.fn(),
}));

import { GET as getRoles } from "@/app/api/manage/roles/route";
import { GET as getUsers } from "@/app/api/manage/users/route";

describe("management paginated catalog routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: "admin" });
    mocks.listRoles.mockResolvedValue({
      items: [{
        id: "role-1",
        name: "database-name",
        description: "",
        permissions: [],
        members: 0,
        systemKey: "support_operator",
      }],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });
    mocks.listUsers.mockResolvedValue({
      items: [{ id: "user-1", name: "Alice", email: "alice@example.com" }],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });
  });

  it("returns searchable role options with page metadata", async () => {
    const response = await getRoles(
      new Request("http://localhost/api/manage/roles?page=2&pageSize=10&q=support"),
    );

    expect(mocks.requireAdmin).toHaveBeenCalledWith({ superAdminOnly: true });
    expect(mocks.listRoles).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      query: "support",
    });
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: "role-1", label: "支持专员（系统角色）" }],
      page: 2,
      totalPages: 2,
    });
  });

  it("returns searchable assignable users with page metadata", async () => {
    const response = await getUsers(
      new Request("http://localhost/api/manage/users?page=2&pageSize=10&q=alice"),
    );

    expect(mocks.requireAdmin).toHaveBeenCalledWith({ superAdminOnly: true });
    expect(mocks.listUsers).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      query: "alice",
    });
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: "user-1", label: "Alice · alice@example.com" }],
      page: 2,
      totalPages: 2,
    });
  });
});
