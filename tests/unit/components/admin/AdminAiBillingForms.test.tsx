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

  it("offers deletion for a disabled model without disabling its provider", () => {
    render(
      <AdminAiProviders
        providers={{
          items: [{
            providerId: "00000000-0000-4000-8000-000000000001",
            providerName: "已停用服务",
            baseUrl: "https://example.com/v1",
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
});
