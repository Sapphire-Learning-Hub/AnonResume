import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  listAiAdminLedger: vi.fn(),
  listAiAdminProviders: vi.fn(),
  listAiAdminQuotas: vi.fn(),
  listAiAdminUsage: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  requireAdminPage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/admin/page", () => ({
  requireAdminPage: mocks.requireAdminPage,
}));

vi.mock("@/lib/ai/admin/service", () => ({
  listAiAdminLedger: mocks.listAiAdminLedger,
  listAiAdminProviders: mocks.listAiAdminProviders,
  listAiAdminQuotas: mocks.listAiAdminQuotas,
  listAiAdminUsage: mocks.listAiAdminUsage,
}));

vi.mock("@/lib/ai/config/configuration", () => ({
  resolveAiConfiguration: () => ({ defaultMonthlyPoints: 10_000 }),
}));

vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve("zh-CN"),
}));

import ManagementAiPage from "@/app/app/(workbench)/manage/ai/page";
import ManagementAiLedgerPage from "@/app/app/(workbench)/manage/ai/ledger/page";
import ManagementAiProvidersPage from "@/app/app/(workbench)/manage/ai/providers/page";
import ManagementAiQuotasPage from "@/app/app/(workbench)/manage/ai/quotas/page";
import ManagementAiUsagePage from "@/app/app/(workbench)/manage/ai/usage/page";

describe("AI management routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects the AI management entry to the first permitted subpage without loading data", async () => {
    mocks.requireAdminPage.mockResolvedValue({
      kind: "administrator",
      permissions: ["ai.quotas.manage", "ai.usage.read"],
    });

    await expect(
      ManagementAiPage(),
    ).rejects.toThrow("REDIRECT:/app/manage/ai/quotas");

    expect(mocks.listAiAdminProviders).not.toHaveBeenCalled();
    expect(mocks.listAiAdminQuotas).not.toHaveBeenCalled();
    expect(mocks.listAiAdminUsage).not.toHaveBeenCalled();
    expect(mocks.listAiAdminLedger).not.toHaveBeenCalled();
  });

  it("redirects super administrators to provider management", async () => {
    mocks.requireAdminPage.mockResolvedValue({ kind: "super_admin" });

    await expect(
      ManagementAiPage(),
    ).rejects.toThrow("REDIRECT:/app/manage/ai/providers");
  });

  it.each([
    ["providers", ManagementAiProvidersPage, mocks.listAiAdminProviders, "模型服务"],
    ["quotas", ManagementAiQuotasPage, mocks.listAiAdminQuotas, "用户额度"],
    ["usage", ManagementAiUsagePage, mocks.listAiAdminUsage, "用量与结算"],
    ["ledger", ManagementAiLedgerPage, mocks.listAiAdminLedger, "积分流水"],
  ] as const)("loads only %s data for its subpage", async (_name, page, loader, title) => {
    mocks.requireAdminPage.mockResolvedValue({ kind: "super_admin" });
    loader.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });

    render(await page({ searchParams: Promise.resolve({ q: "测试" }) }));

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
    const otherLoaders = [
      mocks.listAiAdminProviders,
      mocks.listAiAdminQuotas,
      mocks.listAiAdminUsage,
      mocks.listAiAdminLedger,
    ].filter((candidate) => candidate !== loader);
    for (const otherLoader of otherLoaders) {
      expect(otherLoader).not.toHaveBeenCalled();
    }
  });
});
