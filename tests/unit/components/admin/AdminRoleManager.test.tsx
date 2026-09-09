import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: { error: vi.fn() } }),
}));

import { AdminRoleManager } from "@/components/admin/AdminRoleManager";

describe("AdminRoleManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("confirms before deleting a custom role", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    render(
      <AdminRoleManager
        administrators={{ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }}
        roles={{
          items: [{
            description: "临时角色",
            id: "role-1",
            members: 0,
            name: "测试角色",
            permissions: ["users.read"],
            systemKey: null,
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        searchParams={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "删除角色" });
    expect(within(dialog).getByText(/测试角色/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/manage/roles/role-1", {
        method: "DELETE",
      });
    });
  });

  it("confirms when editing a role removes existing permissions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    render(
      <AdminRoleManager
        administrators={{ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }}
        roles={{
          items: [{
            description: "审核内容",
            id: "role-1",
            members: 2,
            name: "内容审核员",
            permissions: ["users.read", "audit.read"],
            systemKey: null,
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        searchParams={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "查看审计" }));
    fireEvent.click(screen.getByRole("button", { name: "保存角色" }));

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen
      .getByText("确认移除角色权限", { selector: ".ant-modal-title" })
      .closest('[role="dialog"]');
    expect(dialog).toBeInstanceOf(HTMLElement);
    expect(within(dialog as HTMLElement).getByText(/查看审计/)).toBeInTheDocument();
    fireEvent.click(within(dialog as HTMLElement).getByRole("button", { name: "确认保存" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/manage/roles/role-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  it("confirms before removing all management access", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    render(
      <AdminRoleManager
        administrators={{
          items: [{
            email: "alice@example.com",
            id: "user-1",
            name: "Alice",
            principalKind: "delegated_admin",
            roles: [{
              id: "role-1",
              name: "Support",
              permissions: ["users.read"],
              systemKey: null,
            }],
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        roles={{ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }}
        searchParams={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "移除管理权限" }));

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "移除管理权限" });
    expect(within(dialog).getByText(/Alice/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认移除" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/manage/administrators",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("confirms when saving removes an existing user role", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    render(
      <AdminRoleManager
        administrators={{
          items: [{
            email: "alice@example.com",
            id: "user-1",
            name: "Alice",
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
                name: "Audit",
                permissions: ["audit.read"],
                systemKey: null,
              },
            ],
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        roles={{ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }}
        searchParams={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "管理角色" }));
    const editor = screen.getByRole("dialog", { name: "管理用户角色" });
    const removeButtons = within(editor).getAllByLabelText("close");
    const removeControl = removeButtons
      .map((button) => button.closest(".ant-select-selection-item-remove"))
      .find(Boolean);
    expect(removeControl).toBeInstanceOf(HTMLElement);
    fireEvent.mouseDown(removeControl as HTMLElement);
    fireEvent.click(removeControl as HTMLElement);
    fireEvent.click(within(editor).getByRole("button", { name: "保存角色分配" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("确认移除用户角色", { selector: ".ant-modal-title" }),
    ).toBeInTheDocument();
  });
});
