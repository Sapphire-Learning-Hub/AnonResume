import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: { error: vi.fn() } }),
}));

import { AdminRoleManager } from "@/components/admin/AdminRoleManager";

describe("AdminRoleManager", () => {
  it("presents persisted system roles as immutable roles instead of templates", () => {
    render(
      <AdminRoleManager
        administrators={{
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        }}
        roles={{
          items: [
            {
              description: "database-description",
              id: "system-role-1",
              members: 0,
              name: "database-name",
              permissions: ["users.read"],
              systemKey: "read_only_auditor",
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        } as never}
        searchParams={{}}
      />,
    );

    expect(screen.getByText("只读审计员")).toBeInTheDocument();
    expect(screen.getByText("系统角色")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "创建角色" }));
    expect(screen.queryByText("从预设开始")).toBeNull();
  });

  it("moves section operations into headers and previews effective permissions", () => {
    render(
      <AdminRoleManager
        administrators={{
          items: [{
            id: "user-1",
            name: "Alice",
            email: "alice@example.com",
            principalKind: "delegated_admin",
            roles: [
              {
                id: "role-1",
                name: "Support",
                permissions: ["users.read"],
                systemKey: null,
              },
              {
                id: "role-2",
                name: "database-auditor",
                permissions: ["audit.read"],
                systemKey: "read_only_auditor",
              },
            ],
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        roles={{
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        }}
        searchParams={{}}
      />,
    );

    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByText("只读审计员")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建角色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /授\s*权/ })).toBeInTheDocument();
    expect(document.querySelector(".admin-toolbar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "管理角色" }));
    expect(screen.getByText("授权后权限")).toBeInTheDocument();
    expect(screen.getByText("查看用户")).toBeInTheDocument();
    expect(screen.getByText("查看审计")).toBeInTheDocument();
    expect(screen.queryByText("width=720")).toBeNull();
    expect(screen.getByRole("button", { name: "管理角色" })).toBeInTheDocument();
  });
});
