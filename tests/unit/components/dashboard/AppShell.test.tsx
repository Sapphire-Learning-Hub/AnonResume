import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { AppShell } from "@/components/dashboard/AppShell";
import {
  PublicRuntimeConfigProvider,
  type PublicRuntimeConfig,
} from "@/components/config/PublicRuntimeConfigProvider";
import type { AppShellAccess } from "@/lib/auth/app-shell-access";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";

const navigationState = vi.hoisted(() => ({ pathname: "/app/fonts" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

const user = { email: "user@example.com", name: "测试用户" };
const productAccess: AppShellAccess = {
  canEnterManagement: false,
  mfaEnrollmentRequired: false,
  mode: "product",
  productAccess: true,
};

function renderShell(
  access: AppShellAccess = productAccess,
  announcements: readonly LocalizedAnnouncement[] = [],
  configuration: PublicRuntimeConfig = {
    configurationHealth: "healthy",
    sourceCodeUrl: "",
  },
) {
  return render(
    <PublicRuntimeConfigProvider value={configuration}>
      <AppShell access={access} announcements={announcements} user={user}>
        <div data-testid="route-child">Route content</div>
      </AppShell>
    </PublicRuntimeConfigProvider>,
  );
}

describe("AppShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders route children inside persistent workbench chrome", () => {
    renderShell();

    expect(screen.getByTestId("route-child")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "字体市场" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("places account controls in the sidebar footer", async () => {
    renderShell();

    const accountFooter = screen.getByTestId("workbench-account-footer");
    expect(accountFooter.closest("aside")).not.toBeNull();

    fireEvent.click(
      within(accountFooter).getByRole("button", {
        name: /测试用户.*user@example.com/,
      }),
    );

    expect(
      await screen.findByRole("button", { name: "打开界面设置" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("测试用户").every((element) => !element.closest("header")),
    ).toBe(true);
  });

  it("opens invitations from the account menu instead of the sidebar", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ activeCount: 0, limit: 5, items: [] })),
    );
    renderShell();

    expect(screen.queryByRole("link", { name: "邀请用户" })).toBeNull();
    const accountButton = within(screen.getByTestId("workbench-account-footer"))
      .getByRole("button", { name: /测试用户.*user@example.com/ });
    fireEvent.click(accountButton);
    fireEvent.click(await screen.findByRole("button", { name: "邀请用户" }));

    const invitationDialog = await screen.findByRole("dialog");
    expect(within(invitationDialog).getByText("邀请用户")).toBeInTheDocument();
    expect(await screen.findByText("0 / 5")).toBeInTheDocument();
    expect(accountButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(within(invitationDialog).getByRole("button", { name: "Close" }));
    expect(accountButton).toHaveAttribute("aria-expanded", "false");
    expect(fetch).toHaveBeenCalledWith(
      "/api/invitations",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("closes the account menu while keeping interface settings open", async () => {
    renderShell();
    const accountButton = within(screen.getByTestId("workbench-account-footer"))
      .getByRole("button", { name: /测试用户.*user@example.com/ });
    fireEvent.click(accountButton);
    expect(accountButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(await screen.findByRole("button", { name: "打开界面设置" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(accountButton).toHaveAttribute("aria-expanded", "false");
  });

  it("places announcements in the top bar beside the brand", () => {
    renderShell(productAccess, [
      {
        id: "notice-1",
        title: "版本提示",
        body: "当前版本仍在持续完善。",
        tone: "warning",
        dismissible: true,
      },
    ]);

    const announcement = screen.getByLabelText("系统公告");
    expect(announcement.closest("header")).not.toBeNull();
  });

  it("collapses only the desktop sidebar width", () => {
    navigationState.pathname = "/app";
    renderShell();

    const workspace = screen.getByTestId("workbench-workspace");
    expect(getComputedStyle(workspace).gridTemplateColumns).toContain("273px");

    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));

    expect(getComputedStyle(workspace).gridTemplateColumns).toContain("56px");
  });

  it("delegates font-market scrolling without owning its page content", () => {
    navigationState.pathname = "/app/fonts";
    renderShell();

    const frame = screen.getByTestId("workbench-content-frame");
    expect(frame).toHaveAttribute("data-scroll-mode", "internal");
    expect(getComputedStyle(frame).overflowY).toBe("hidden");
  });

  it("expands permission-filtered AI pages in the management sidebar", () => {
    navigationState.pathname = "/app/manage/ai/usage";
    renderShell({
      kind: "delegated_admin",
      mode: "management",
      permissions: ["ai.quotas.manage", "ai.audit.sensitive.read"],
      productAccess: false,
    });

    expect(screen.getByRole("link", { name: "AI 管理" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "用户额度" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "用量与结算" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: "模型服务" })).toBeNull();
    expect(screen.queryByRole("link", { name: "积分流水" })).toBeNull();
  });

  it("retains product navigation for a delegated administrator in recovery", () => {
    navigationState.pathname = "/app/manage/security";
    renderShell({
      kind: "delegated_admin",
      mode: "recovery",
      productAccess: true,
    });

    expect(
      screen.getByRole("link", { name: "管理安全" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "我的简历" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "字体市场" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "管理概览" })).not.toBeInTheDocument();
  });

  it("shows restart-scoped capability status without exposing configuration keys", () => {
    renderShell(
      {
        kind: "super_admin",
        mode: "management",
        permissions: [],
        productAccess: false,
      },
      [],
      {
        configurationHealth: "restart_required",
        sourceCodeUrl: "",
      },
    );

    expect(screen.getByText("部分配置等待重启生效")).toBeInTheDocument();
    expect(screen.getByText(/邮件发送与第三方登录配置/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看平台配置" })).toHaveAttribute(
      "href",
      "/app/manage/configuration",
    );
    expect(screen.queryByText(/smtpPassword|githubClientSecret/)).toBeNull();
  });
});
