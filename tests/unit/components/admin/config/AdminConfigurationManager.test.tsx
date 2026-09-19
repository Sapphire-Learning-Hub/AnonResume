import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));
const feedbackMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));
const sensitiveMocks = vi.hoisted(() => ({
  run: vi.fn(async (request: () => Promise<Response>) => request()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: feedbackMocks }),
}));

vi.mock("@/components/admin/ai/useAdminAiSensitiveAction", () => ({
  useAdminAiSensitiveAction: () => ({
    pending: false,
    reauthModal: null,
    runSensitive: sensitiveMocks.run,
  }),
}));

import { AdminConfigurationManager } from "@/components/admin/config/AdminConfigurationManager";

const initialState = {
  activeRevision: { id: "active-1", version: 1 },
  draftRevision: {
    baseVersion: 1,
    id: "16cb7fb7-ab5f-416f-b037-0b83cbf76549",
    updatedAt: "2026-09-20T00:00:00.000Z",
  },
  fields: [
    {
      applyMode: "hot" as const,
      configured: true,
      consumers: ["web" as const],
      group: "resume" as const,
      key: "resumeVersionHistoryLimit" as const,
      public: false,
      sensitive: false,
      value: 5,
    },
    {
      applyMode: "hot" as const,
      configured: true,
      consumers: ["web" as const, "ai-worker" as const],
      group: "ai" as const,
      key: "aiTrustedEndpointHostnames" as const,
      public: false,
      sensitive: false,
      value: ["api.example.com"],
    },
    {
      applyMode: "restart" as const,
      configured: true,
      consumers: ["web" as const],
      group: "email" as const,
      key: "smtpPassword" as const,
      public: false,
      sensitive: true,
    },
  ],
  pendingRestartConsumers: [],
};

function renderManager(overrides: Partial<React.ComponentProps<typeof AdminConfigurationManager>> = {}) {
  render(
    <AdminConfigurationManager
      canEdit
      canPublish
      canReadHistory
      canRollback
      initialState={initialState}
      {...overrides}
    />,
  );
}

describe("AdminConfigurationManager", () => {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
      nativeGetComputedStyle(element),
    );
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        matches: false,
        media: query,
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves integer and list edits as a revision-guarded patch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(initialState), { status: 200 }),
    );
    renderManager();

    fireEvent.change(screen.getByLabelText("简历历史版本上限"), {
      target: { value: "8" },
    });
    const hostnames = screen.getByLabelText("AI 可信端点域名");
    fireEvent.mouseDown(hostnames);
    fireEvent.change(hostnames, { target: { value: "other.example.com" } });
    fireEvent.keyDown(hostnames, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, request] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(request?.body))).toEqual({
      baseVersion: 1,
      draftRevisionId: initialState.draftRevision.id,
      changes: expect.arrayContaining([
        {
          key: "resumeVersionHistoryLimit",
          operation: "set",
          value: 8,
        },
        {
          key: "aiTrustedEndpointHostnames",
          operation: "set",
          value: ["api.example.com", "other.example.com"],
        },
      ]),
    });
  });

  it("keeps configured secrets empty until replacement or explicit clear", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(initialState), { status: 200 }),
    );
    renderManager();

    expect(screen.getByText("已配置")).toBeInTheDocument();
    expect(screen.queryByLabelText("SMTP 密码")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "替换 SMTP 密码" }));
    fireEvent.change(screen.getByLabelText("SMTP 密码"), {
      target: { value: "replacement-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).changes).toContainEqual({
      key: "smtpPassword",
      operation: "set",
      value: "replacement-secret",
    });

    fetchMock.mockClear();
    renderManager();
    fireEvent.click(screen.getAllByRole("button", { name: "清除 SMTP 密码" })[1]!);
    fireEvent.click(screen.getAllByRole("button", { name: "保存草稿" }).at(-1)!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).changes).toContainEqual({
      key: "smtpPassword",
      operation: "clear",
    });
  });

  it("reloads current state after a revision conflict", async () => {
    const refreshed = {
      ...initialState,
      activeRevision: { id: "active-2", version: 2 },
      draftRevision: {
        ...initialState.draftRevision,
        baseVersion: 2,
        id: "1b21a7ba-499e-4576-b669-5d49c98ff47c",
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "configuration_conflict" }), {
          status: 409,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(refreshed), { status: 200 }));
    renderManager();

    fireEvent.change(screen.getByLabelText("简历历史版本上限"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/manage/configuration");
    expect(screen.getByText("当前生效版本 2")).toBeInTheDocument();
    expect(feedbackMocks.error).toHaveBeenCalled();
  });

  it("publishes through the shared sensitive-action flow", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(initialState), { status: 200 }),
    );
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "发布配置" }));
    const dialog = screen
      .getByText("发布平台配置", { selector: ".ant-modal-title" })
      .closest<HTMLElement>('[role="dialog"]');
    expect(dialog).toBeInstanceOf(HTMLElement);
    fireEvent.click(within(dialog as HTMLElement).getByRole("button", { name: "确认发布" }));

    await waitFor(() => expect(sensitiveMocks.run).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/manage/configuration/publish",
      expect.objectContaining({ method: "POST" }),
    );
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("loads revision details and requires confirmation before rollback", async () => {
    const history = [{
      changes: [{ after: 8, before: 5, field: "resumeVersionHistoryLimit" }],
      createdAt: "2026-09-20T00:00:00.000Z",
      createdByUserId: "admin-1",
      id: "history-1",
      publishedAt: "2026-09-20T00:05:00.000Z",
      publishedByUserId: "admin-1",
      status: "superseded",
      summary: "Initial configuration",
      updatedAt: "2026-09-20T00:05:00.000Z",
      version: 1,
    }];
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(history), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(initialState), { status: 200 }));
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "配置历史" }));
    const historyTitle = await screen.findByText("配置历史", { selector: ".ant-modal-title" });
    const historyDialog = historyTitle.closest<HTMLElement>('[role="dialog"]');
    expect(historyDialog).toBeInstanceOf(HTMLElement);
    fireEvent.click(within(historyDialog as HTMLElement).getByRole("button", { name: "详情" }));
    const detailDialog = screen
      .getByText("版本 1 详情", { selector: ".ant-modal-title" })
      .closest<HTMLElement>('[role="dialog"]');
    expect(detailDialog).toBeInstanceOf(HTMLElement);
    expect(within(detailDialog as HTMLElement).getByText("简历历史版本上限")).toBeInTheDocument();
    fireEvent.click(within(detailDialog as HTMLElement).getByRole("button", { name: "准备回滚" }));

    const confirmation = screen
      .getByText("确认准备回滚", { selector: ".ant-modal-title" })
      .closest<HTMLElement>('[role="dialog"]');
    expect(confirmation).toBeInstanceOf(HTMLElement);
    fireEvent.click(within(confirmation as HTMLElement).getByRole("button", { name: "确认准备" }));
    await waitFor(() => expect(sensitiveMocks.run).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/manage/configuration/revisions/history-1/rollback",
      { method: "POST" },
    );
  });
});
