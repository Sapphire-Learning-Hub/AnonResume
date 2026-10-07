import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  listAdminUsers: vi.fn(),
  requireAdminPage: vi.fn(),
}));

vi.mock("@/lib/admin/page", () => ({
  requireAdminPage: mocks.requireAdminPage,
}));
vi.mock("@/lib/admin/query", () => ({
  listAdminUsers: mocks.listAdminUsers,
}));
vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve("zh-CN"),
}));
vi.mock("@/components/admin/AdminInviteUser", () => ({
  AdminInviteUser: () => null,
}));
vi.mock("@/components/admin/AdminUserActions", () => ({
  AdminUserActions: () => <button type="button">用户操作</button>,
}));

import ManagementUsersPage from "@/app/app/(workbench)/manage/users/page";

describe("management users page lifecycle states", () => {
  beforeEach(() => {
    mocks.requireAdminPage.mockResolvedValue({
      kind: "super_admin",
      permissions: [],
    });
    mocks.listAdminUsers.mockResolvedValue({
      items: [
        {
          id: "pending-user",
          name: "Pending User",
          email: "pending@example.com",
          emailVerified: true,
          invitationPending: false,
          createdAt: new Date("2026-10-01T00:00:00.000Z"),
          resumes: 0,
          principalKind: null,
          roles: [],
          suspended: false,
          lifecycleStatus: "pending_deletion",
          deletionDueAt: new Date("2026-10-14T00:00:00.000Z"),
          deletedAt: null,
        },
        {
          id: "deleted-user",
          name: "Deleted user",
          email: "deleted+id@deleted.invalid",
          emailVerified: false,
          invitationPending: false,
          createdAt: new Date("2026-09-01T00:00:00.000Z"),
          resumes: 0,
          principalKind: null,
          roles: [],
          suspended: false,
          lifecycleStatus: "deleted",
          deletionDueAt: new Date("2026-10-14T00:00:00.000Z"),
          deletedAt: new Date("2026-10-14T00:00:00.000Z"),
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it("shows pending and deleted status without management actions", async () => {
    render(await ManagementUsersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/待注销.*2026\/10\/14/)).toBeInTheDocument();
    expect(screen.getByText("已注销")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "用户操作" })).not.toBeInTheDocument();
  });
});
