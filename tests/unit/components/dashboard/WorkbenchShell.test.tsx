import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { WorkbenchShell } from "@/components/dashboard/WorkbenchShell";

const navigationState = vi.hoisted(() => ({ pathname: "/app/fonts" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

const user = { email: "user@example.com", name: "测试用户" };

function renderWorkbench() {
  return render(
    <WorkbenchShell createAction="/app/create-resume" resumes={[]} user={user} />,
  );
}

describe("WorkbenchShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("switches workbench views through native history without starting a route navigation", () => {
    navigationState.pathname = "/app";
    const pushState = vi
      .spyOn(window.history, "pushState")
      .mockImplementation(() => undefined);

    renderWorkbench();

    screen.getByRole("link", { name: "字体市场" }).click();

    expect(pushState).toHaveBeenCalledWith(null, "", "/app/fonts");
  });

  it("renders shared navigation and marks the active workbench page", () => {
    navigationState.pathname = "/app/fonts";
    renderWorkbench();

    expect(screen.getByRole("heading", { name: "字体市场" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "我的简历" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("link", { name: "字体市场" })).toHaveAttribute(
      "href",
      "/app/fonts",
    );
    expect(screen.getByRole("link", { name: "字体市场" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "字体市场" })).toHaveAttribute(
      "data-collapsed",
      "false",
    );
    expect(screen.getByRole("link", { name: "我的简历" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByTestId("workbench-nav-icon-resumes")).toBeInTheDocument();
    expect(screen.getByTestId("workbench-nav-icon-fonts")).toBeInTheDocument();
  });

  it("collapses and expands the desktop sidebar without persisting the state", () => {
    navigationState.pathname = "/app";
    const firstRender = renderWorkbench();
    const sidebar = screen.getByRole("complementary");
    const workspace = screen.getByTestId("workbench-workspace");

    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect(workspace).toHaveAttribute("data-collapsed", "false");
    expect(getComputedStyle(workspace).gridTemplateColumns).toContain("273px");

    fireEvent.click(screen.getByRole("button", { name: "收起侧边栏" }));

    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(workspace).toHaveAttribute("data-collapsed", "true");
    expect(getComputedStyle(workspace).gridTemplateColumns).toContain("56px");
    expect(screen.getByRole("button", { name: "展开侧边栏" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "我的简历" })).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    expect(screen.getByRole("link", { name: "字体市场" })).toHaveAttribute(
      "data-collapsed",
      "true",
    );

    firstRender.unmount();
    renderWorkbench();

    expect(screen.getByRole("complementary")).toHaveAttribute(
      "data-collapsed",
      "false",
    );
  });

  it("keeps the workbench chrome fixed while the content frame scrolls", () => {
    navigationState.pathname = "/app";
    renderWorkbench();

    const contentFrame = screen.getByTestId("workbench-content-frame");

    expect(contentFrame).toHaveAttribute("data-scroll-mode", "frame");
    expect(getComputedStyle(screen.getByRole("main")).overflow).toBe("hidden");
    expect(getComputedStyle(contentFrame).overflowY).toBe("auto");
    expect(getComputedStyle(screen.getByRole("complementary")).overflow).toBe(
      "hidden",
    );
  });

  it("can delegate scrolling to a page-owned internal list", () => {
    navigationState.pathname = "/app/fonts";
    renderWorkbench();

    const contentFrame = screen.getByTestId("workbench-content-frame");

    expect(contentFrame).toHaveAttribute("data-scroll-mode", "internal");
    expect(getComputedStyle(contentFrame).overflowY).toBe("hidden");
  });
});
