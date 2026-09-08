import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { AppShell } from "@/components/dashboard/AppShell";
import type { AppShellAccess } from "@/lib/app-shell-access";

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

function renderShell(access: AppShellAccess = productAccess) {
  return render(
    <AppShell access={access} user={user}>
      <div data-testid="route-child">Route content</div>
    </AppShell>,
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

  it("renders recovery navigation without product links", () => {
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
      screen.queryByRole("link", { name: "我的简历" }),
    ).not.toBeInTheDocument();
  });
});
