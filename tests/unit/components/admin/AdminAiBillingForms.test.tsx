import { fireEvent, render, screen, within } from "@testing-library/react";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn(), success: vi.fn() },
  }),
}));

import { AdminAiProviders } from "@/components/admin/ai/AdminAiProviders";
import { AdminAiQuotas } from "@/components/admin/ai/AdminAiQuotas";

describe("AI billing administration forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.unstubAllGlobals();
  });

  it("labels quota fields and exposes period and default controls", () => {
    render(
      <AdminAiQuotas
        defaultMonthlyPoints={100_000}
        quotas={{
          items: [{
            userId: "user-1",
            userName: "测试用户",
            email: "user@example.com",
            monthlyLimit: "24000",
            customLimit: true,
            usedPoints: "120",
            reservedPoints: "30",
            periodStartedAt: "2026-09-01T00:00:00.000Z",
            periodEndsAt: "2026-10-01T00:00:00.000Z",
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        searchParams={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调整额度" }));
    const dialog = screen.getByRole("dialog", { name: "调整额度" });

    expect(within(dialog).getByLabelText("每月额度")).toBeInTheDocument();
    expect(within(dialog).getByText("已使用：120")).toBeInTheDocument();
    expect(within(dialog).getByText("已预留：30")).toBeInTheDocument();
    expect(within(dialog).getByText("额度周期")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "恢复默认额度" })).toBeInTheDocument();
  });

  it("makes zero-rate billing an explicit free-model choice", () => {
    render(
      <AdminAiProviders
        providers={{
          items: [{
            providerId: "00000000-0000-4000-8000-000000000001",
            providerName: "模型服务",
            baseUrl: "https://example.com/v1",
            allowCrossOriginRedirects: false,
            providerEnabled: true,
            models: [{
              providerId: "00000000-0000-4000-8000-000000000001",
              modelId: "00000000-0000-4000-8000-000000000002",
              modelKey: "example-model",
              modelName: "示例模型",
              modelEnabled: true,
              supportsToolCalls: true,
              contextWindow: 128_000,
              maxOutputTokens: 4_096,
              inputPointRate: "0",
              cachedInputPointRate: "0",
              outputPointRate: "0",
              rateCardVersion: 1,
            }],
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        searchParams={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑模型" }));
    const dialog = screen.getByRole("dialog", { name: "编辑模型" });

    expect(within(dialog).getByRole("checkbox", {
      name: "免费模型（不扣减用户额度）",
    })).toBeChecked();
    expect(within(dialog).getByText("输入费率（积分/百万 Token）")).toBeInTheDocument();
  });

  it("warns only after administrative cross-origin redirects are enabled", async () => {
    render(
      <AdminAiProviders
        providers={{
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        }}
        searchParams={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "添加模型服务" }));
    const dialog = screen.getByRole("dialog", { name: "添加模型服务" });
    expect(
      within(dialog).queryByLabelText(/跨域重定向可能会将 API 密钥/),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "允许跨域重定向" }),
    );
    const warning = within(dialog).getByLabelText(
      /跨域重定向可能会将 API 密钥/,
    );
    fireEvent.mouseEnter(warning);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "跨域重定向可能会将 API 密钥和简历内容发送到其他域名，仅应为完全信任的服务开启。",
    );
  });

  it("groups each provider and its models in an accessible catalog card", () => {
    render(
      <AdminAiProviders
        providers={{
          items: [{
            providerId: "00000000-0000-4000-8000-000000000001",
            providerName: "模型服务",
            baseUrl: "https://example.com/v1",
            allowCrossOriginRedirects: false,
            providerEnabled: true,
            models: [{
              providerId: "00000000-0000-4000-8000-000000000001",
              modelId: "00000000-0000-4000-8000-000000000002",
              modelKey: "example-model",
              modelName: "示例模型",
              modelEnabled: true,
              supportsToolCalls: true,
              contextWindow: 128_000,
              maxOutputTokens: 4_096,
              inputPointRate: "0",
              cachedInputPointRate: "0",
              outputPointRate: "0",
              rateCardVersion: 1,
            }],
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        searchParams={{}}
      />,
    );

    const providerCard = screen.getByRole("article", { name: "模型服务" });
    expect(within(providerCard).getByRole("heading", {
      level: 3,
      name: "模型服务",
    })).toBeInTheDocument();
    expect(within(providerCard).getByRole("heading", {
      level: 4,
      name: "示例模型",
    })).toBeInTheDocument();
    expect(within(providerCard).getByText("免费模型")).toBeInTheDocument();
  });

  it("offers deletion for a disabled model without disabling its provider", () => {
    render(
      <AdminAiProviders
        providers={{
          items: [{
            providerId: "00000000-0000-4000-8000-000000000001",
            providerName: "已停用服务",
            baseUrl: "https://example.com/v1",
            allowCrossOriginRedirects: false,
            providerEnabled: true,
            models: [{
              providerId: "00000000-0000-4000-8000-000000000001",
              modelId: "00000000-0000-4000-8000-000000000002",
              modelKey: "disabled-model",
              modelName: "已停用模型",
              modelEnabled: false,
              supportsToolCalls: true,
              contextWindow: 128_000,
              maxOutputTokens: 4_096,
              inputPointRate: "100",
              cachedInputPointRate: "50",
              outputPointRate: "200",
              rateCardVersion: 1,
            }],
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

    expect(screen.getByRole("dialog", { name: "删除模型" })).toBeInTheDocument();
    expect(screen.getByText("删除后不能恢复，但历史调用和计费记录仍会保留。")).toBeInTheDocument();
  });

  it("exposes direct state actions for providers and models", () => {
    render(
      <AdminAiProviders
        providers={{
          items: [{
            providerId: "00000000-0000-4000-8000-000000000001",
            providerName: "已停用服务",
            baseUrl: "https://example.com/v1",
            allowCrossOriginRedirects: false,
            providerEnabled: false,
            models: [{
              providerId: "00000000-0000-4000-8000-000000000001",
              modelId: "00000000-0000-4000-8000-000000000002",
              modelKey: "disabled-model",
              modelName: "已停用模型",
              modelEnabled: false,
              supportsToolCalls: true,
              contextWindow: 128_000,
              maxOutputTokens: 4_096,
              inputPointRate: "100",
              cachedInputPointRate: "50",
              outputPointRate: "200",
              rateCardVersion: 1,
            }],
          }, {
            providerId: "00000000-0000-4000-8000-000000000003",
            providerName: "启用服务",
            baseUrl: "https://example.com/v1",
            allowCrossOriginRedirects: false,
            providerEnabled: true,
            models: [{
              providerId: "00000000-0000-4000-8000-000000000003",
              modelId: "00000000-0000-4000-8000-000000000004",
              modelKey: "enabled-model",
              modelName: "启用模型",
              modelEnabled: true,
              supportsToolCalls: true,
              contextWindow: 128_000,
              maxOutputTokens: 4_096,
              inputPointRate: "100",
              cachedInputPointRate: "50",
              outputPointRate: "200",
              rateCardVersion: 1,
            }],
          }],
          page: 1,
          pageSize: 20,
          total: 2,
          totalPages: 1,
        }}
        searchParams={{}}
      />,
    );

    const disabledProvider = screen.getByRole("article", {
      name: "已停用服务",
    });
    expect(within(disabledProvider).getByRole("button", {
      name: "启用服务",
    })).toBeInTheDocument();
    expect(within(disabledProvider).getByRole("button", {
      name: "删除模型服务",
    })).toBeInTheDocument();
    expect(within(disabledProvider).getByRole("button", {
      name: "启用模型",
    })).toBeDisabled();

    const enabledProvider = screen.getByRole("article", { name: "启用服务" });
    expect(within(enabledProvider).getByRole("button", {
      name: "停用模型",
    })).toBeInTheDocument();
    expect(within(enabledProvider).getByRole("button", {
      name: "计费历史",
    })).toBeInTheDocument();
  });

  it("shows the current and previous rate versions on demand", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      modelId: "00000000-0000-4000-8000-000000000002",
      currentVersion: 2,
      versions: [{
        version: 2,
        inputPointRate: "120",
        cachedInputPointRate: "60",
        outputPointRate: "240",
        createdAt: "2026-09-18T00:00:00.000Z",
        current: true,
      }, {
        version: 1,
        inputPointRate: "100",
        cachedInputPointRate: "50",
        outputPointRate: "200",
        createdAt: "2026-09-17T00:00:00.000Z",
        current: false,
      }],
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminAiProviders
        providers={{
          items: [{
            providerId: "00000000-0000-4000-8000-000000000001",
            providerName: "模型服务",
            baseUrl: "https://example.com/v1",
            allowCrossOriginRedirects: false,
            providerEnabled: true,
            models: [{
              providerId: "00000000-0000-4000-8000-000000000001",
              modelId: "00000000-0000-4000-8000-000000000002",
              modelKey: "example-model",
              modelName: "示例模型",
              modelEnabled: true,
              supportsToolCalls: true,
              contextWindow: 128_000,
              maxOutputTokens: 4_096,
              inputPointRate: "120",
              cachedInputPointRate: "60",
              outputPointRate: "240",
              rateCardVersion: 2,
            }],
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        searchParams={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "计费历史" }));

    const dialog = await screen.findByRole("dialog", {
      name: "示例模型 · 计费历史",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/manage/ai/providers/00000000-0000-4000-8000-000000000001/models/00000000-0000-4000-8000-000000000002/rate-versions",
      { cache: "no-store" },
    );
    expect(await within(dialog).findByText("v2")).toBeInTheDocument();
    expect(within(dialog).getByText("当前")).toBeInTheDocument();
    expect(within(dialog).getByText("v1")).toBeInTheDocument();
  });

  it("shows a tooltip when an administrative model cannot call tools", async () => {
    render(
      <AdminAiProviders
        providers={{
          items: [{
            providerId: "00000000-0000-4000-8000-000000000001",
            providerName: "模型服务",
            baseUrl: "https://example.com/v1",
            allowCrossOriginRedirects: false,
            providerEnabled: true,
            models: [{
              providerId: "00000000-0000-4000-8000-000000000001",
              modelId: "00000000-0000-4000-8000-000000000002",
              modelKey: "chat-only-model",
              modelName: "聊天模型",
              modelEnabled: true,
              supportsToolCalls: false,
              contextWindow: 128_000,
              maxOutputTokens: 4_096,
              inputPointRate: "100",
              cachedInputPointRate: "50",
              outputPointRate: "200",
              rateCardVersion: 1,
            }],
          }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        }}
        searchParams={{}}
      />,
    );

    expect(screen.getByText("仅限聊天")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑模型" }));
    const warning = screen.getByLabelText(
      "该模型不能用于修改简历，仅支持基本聊天功能。",
    );
    fireEvent.mouseEnter(warning);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "该模型不能用于修改简历，仅支持基本聊天功能。",
    );
  });
});
