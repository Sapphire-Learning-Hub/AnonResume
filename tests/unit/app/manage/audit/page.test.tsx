import { fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  listAdminAuditEvents: vi.fn(),
  requireAdminPage: vi.fn(),
}));

vi.mock("@/lib/admin/page", () => ({
  requireAdminPage: mocks.requireAdminPage,
}));

vi.mock("@/lib/admin/query", () => ({
  listAdminAuditEvents: mocks.listAdminAuditEvents,
}));

vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve("zh-CN"),
}));

import ManagementAuditPage from "@/app/app/(workbench)/manage/audit/page";

describe("ManagementAuditPage", () => {
  it("shows readable audit summaries and preserves raw values in details", async () => {
    mocks.requireAdminPage.mockResolvedValue({ kind: "super_admin" });
    mocks.listAdminAuditEvents.mockResolvedValue({
      items: [{
        action: "role.update",
        actor: {
          description: "admin@example.com",
          id: "admin-1",
          label: "管理员",
        },
        actorUserId: "admin-1",
        createdAt: new Date("2026-09-09T13:00:00.000Z"),
        id: "event-1",
        ipHash: "hashed-address",
        metadata: {
          changes: [
            {
              after: "新说明",
              before: "旧说明",
              field: "description",
            },
            {
              after: "suspended",
              before: "active",
              field: "status",
            },
            {
              after: false,
              before: true,
              field: "published",
            },
          ],
          targetSnapshot: { label: "内容审核员" },
        },
        outcome: "success",
        requestId: "request-1",
        resourceLabels: {},
        target: {
          id: "role-1",
          label: "内容审核员",
          type: "admin_role",
        },
        targetId: "role-1",
        targetType: "admin_role",
      }],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    render(
      await ManagementAuditPage({ searchParams: Promise.resolve({}) }),
    );

    expect(screen.getByText("更新角色")).toBeInTheDocument();
    expect(screen.getByText("管理员")).toBeInTheDocument();
    expect(screen.getByText("内容审核员")).toBeInTheDocument();
    expect(screen.getByText("成功")).toHaveAttribute("data-tone", "success");

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    const dialog = screen.getByRole("dialog", { name: "审计详情" });
    expect(within(dialog).getByText("角色说明")).toBeInTheDocument();
    expect(within(dialog).getByText("旧说明")).toBeInTheDocument();
    expect(within(dialog).getByText("新说明")).toBeInTheDocument();
    expect(within(dialog).getByText("正常")).toBeInTheDocument();
    expect(within(dialog).getByText("已停用")).toBeInTheDocument();
    expect(within(dialog).getByText("已发布")).toBeInTheDocument();
    expect(within(dialog).getByText("未发布")).toBeInTheDocument();
    expect(within(dialog).getByText("原始数据")).toBeInTheDocument();
    expect(within(dialog).getByText("role.update")).toBeInTheDocument();
    expect(within(dialog).getByText("role-1")).toBeInTheDocument();
  });

  it("maps permission targets while keeping their raw identifiers", async () => {
    mocks.requireAdminPage.mockResolvedValue({ kind: "super_admin" });
    mocks.listAdminAuditEvents.mockResolvedValue({
      items: [{
        action: "authorization.denied",
        actor: null,
        actorUserId: null,
        createdAt: new Date("2026-09-09T13:00:00.000Z"),
        id: "event-2",
        ipHash: null,
        metadata: {},
        outcome: "denied",
        requestId: null,
        resourceLabels: {},
        target: {
          id: "users.suspend",
          label: "users.suspend",
          type: "permission",
        },
        targetId: "users.suspend",
        targetType: "permission",
      }],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    render(
      await ManagementAuditPage({ searchParams: Promise.resolve({}) }),
    );

    expect(screen.getByText("停用用户")).toBeInTheDocument();
    expect(screen.getByText("权限 · users.suspend")).toBeInTheDocument();
  });

  it("shows readable labels for AI audit actions and targets", async () => {
    mocks.requireAdminPage.mockResolvedValue({ kind: "super_admin" });
    mocks.listAdminAuditEvents.mockResolvedValue({
      items: [
        {
          action: "ai.model.update",
          actor: null,
          actorUserId: null,
          createdAt: new Date("2026-09-19T13:00:00.000Z"),
          id: "event-ai-model",
          ipHash: null,
          metadata: {},
          outcome: "success",
          requestId: null,
          resourceLabels: {},
          target: {
            id: "model-1",
            label: "豆包 Seed 2.1 Pro",
            type: "ai_model",
          },
          targetId: "model-1",
          targetType: "ai_model",
        },
        {
          action: "ai.provider.delete",
          actor: null,
          actorUserId: null,
          createdAt: new Date("2026-09-19T12:00:00.000Z"),
          id: "event-ai-provider",
          ipHash: null,
          metadata: {},
          outcome: "success",
          requestId: null,
          resourceLabels: {},
          target: {
            id: "provider-1",
            label: "火山方舟",
            type: "ai_provider",
          },
          targetId: "provider-1",
          targetType: "ai_provider",
        },
        {
          action: "ai.settlement.resolve",
          actor: null,
          actorUserId: null,
          createdAt: new Date("2026-09-19T11:00:00.000Z"),
          id: "event-ai-run",
          ipHash: null,
          metadata: {},
          outcome: "success",
          requestId: null,
          resourceLabels: {},
          target: {
            id: "run-1",
            label: "run-1",
            type: "ai_run",
          },
          targetId: "run-1",
          targetType: "ai_run",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 3,
      totalPages: 1,
    });

    render(
      await ManagementAuditPage({ searchParams: Promise.resolve({}) }),
    );

    expect(screen.getByText("更新 AI 模型")).toBeInTheDocument();
    expect(screen.getByText("删除模型服务")).toBeInTheDocument();
    expect(screen.getByText("处理 AI 结算")).toBeInTheDocument();
    expect(screen.getByText("AI 模型 · model-1")).toBeInTheDocument();
    expect(screen.getByText("模型服务 · provider-1")).toBeInTheDocument();
    expect(screen.getByText("AI 任务 · run-1")).toBeInTheDocument();
  });
});
