import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const feedbackMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));
const sensitiveMocks = vi.hoisted(() => ({
  run: vi.fn(async (request: () => Promise<Response>) => request()),
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

import { SystemRestartControl } from "@/components/system/SystemRestartControl";

const pendingRuntime = {
  consumer: "web" as const,
  desiredVersion: 3,
  errorCode: null,
  fallbackVersion: null,
  instanceId: "production/web/web-1",
  lastSeenAt: new Date("2026-10-13T08:00:00.000Z"),
  loadedHotVersion: 3,
  loadedRestartVersion: 2,
  onlineRestartSupported: true,
  release: "v1.6.1",
  state: "pending_restart" as const,
  supervisorKind: "docker-compose" as const,
};

const operation = {
  actorUserId: "admin-1",
  completedAt: null,
  createdAt: "2026-10-13T08:00:00.000Z",
  deploymentId: "production",
  desiredRevisionId: "4e86d4f7-f985-4bd1-9e87-a82dfe7acaeb",
  errorCode: null,
  id: "44f65188-e649-4f17-81cc-e0e1fd996be4",
  startedAt: "2026-10-13T08:00:01.000Z",
  status: "running" as const,
  targets: [{
    completedAt: null,
    consumer: "web" as const,
    desiredRestartRevisionId: "4e86d4f7-f985-4bd1-9e87-a82dfe7acaeb",
    drainStartedAt: "2026-10-13T08:00:01.000Z",
    errorCode: null,
    exitStartedAt: null,
    expectedSessionId: "old-session",
    instanceId: "production/web/web-1",
    sequence: 0,
    status: "draining" as const,
    supervisorKind: "docker-compose" as const,
  }],
  updatedAt: "2026-10-13T08:00:01.000Z",
};

describe("SystemRestartControl", () => {
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

  it("disables online restart when a pending target has no verified supervisor", () => {
    render(
      <SystemRestartControl
        canRestart
        initialOperation={null}
        runtimes={[{
          ...pendingRuntime,
          onlineRestartSupported: false,
          supervisorKind: "container",
        }]}
      />,
    );

    expect(screen.getByRole("button", { name: "应用重启配置" })).toBeDisabled();
    expect(screen.getByText("无法确认容器的自动重启策略")).toBeInTheDocument();
  });

  it("requires a five-second confirmation before creating an operation", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(operation), { status: 200 }),
      );
      render(
        <SystemRestartControl
          canRestart
          initialOperation={null}
          runtimes={[pendingRuntime]}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "应用重启配置" }));
      const dialog = screen.getByRole("dialog", { name: "确认重启应用服务" });
      const confirm = within(dialog).getByRole("button", { name: /确认重启/ });
      expect(confirm).toBeDisabled();

      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(confirm).toBeEnabled();
      await act(async () => {
        fireEvent.click(confirm);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/manage/system/restarts",
        expect.objectContaining({ method: "POST" }),
      );
      const request = fetchMock.mock.calls[0]?.[1];
      expect(JSON.parse(String(request?.body)).idempotencyKey).toMatch(
        /^[0-9a-f-]{36}$/,
      );
      expect(screen.getByText("等待当前工作完成")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps progress visible across a disconnect and recovers on a later poll", async () => {
    const completed = {
      ...operation,
      completedAt: "2026-10-13T08:00:05.000Z",
      status: "succeeded" as const,
      targets: operation.targets.map((target) => ({
        ...target,
        completedAt: "2026-10-13T08:00:05.000Z",
        status: "healthy" as const,
      })),
    };
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify(completed), { status: 200 }));

    render(
      <SystemRestartControl
        canRestart
        initialOperation={operation}
        pollBaseDelayMs={10}
        runtimes={[pendingRuntime]}
      />,
    );

    expect(await screen.findByText("连接暂时不可用，正在等待服务恢复")).toBeInTheDocument();
    expect(await screen.findByText("已恢复")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText("连接暂时不可用，正在等待服务恢复"),
      ).not.toBeInTheDocument();
    });
    expect(feedbackMocks.error).not.toHaveBeenCalled();
  });

  it("restores an existing operation without creating another one", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(
      <SystemRestartControl
        canRestart
        initialOperation={{ ...operation, status: "failed" }}
        runtimes={[pendingRuntime]}
      />,
    );

    expect(screen.getByText("需要检查")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
