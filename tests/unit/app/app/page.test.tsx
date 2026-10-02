import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { requireSession } from "@/lib/auth/session";
import { prepareEditorOnboardingEntry } from "@/lib/onboarding/service";
import {
  createGeneratedResumeRecord,
  createResumeRecord,
  publishResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";

import DashboardPage from "@/app/app/(workbench)/page";

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/onboarding/service", () => ({
  prepareEditorOnboardingEntry: vi.fn(),
}));

vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => <button type="button">Sign Out</button>,
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMocks.redirect,
  usePathname: () => "/app",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("Dashboard workbench view", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    navigationMocks.redirect.mockClear();
    vi.mocked(prepareEditorOnboardingEntry).mockResolvedValue({});
    vi.mocked(requireSession).mockResolvedValue({
      session: {
        id: "session-demo",
        userId: "user-demo",
      },
      user: {
        id: "user-demo",
        name: "Demo User",
        email: "demo@example.com",
      },
    } as never);
  });

  it("asks before opening a newly prepared practice run", async () => {
    vi.mocked(prepareEditorOnboardingEntry).mockResolvedValue({
      promptHref: "/app/resumes/practice-one",
      run: {
        id: "run-one",
        userId: "user-demo",
        flowKey: "editor-basics",
        flowVersion: 1,
        source: "automatic",
        resumeId: "practice-one",
        status: "active",
        currentStep: "canvas-intro",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });

    render(await DashboardPage());

    expect(
      screen.getByRole("dialog", { name: "第一次使用简历编辑器？" }),
    ).toBeInTheDocument();
    expect(navigationMocks.redirect).not.toHaveBeenCalled();
  });

  it("shows continuation for an active run without changing the empty catalog", async () => {
    vi.mocked(prepareEditorOnboardingEntry).mockResolvedValue({
      continueHref: "/app/resumes/practice-one",
      run: {
        id: "run-one",
        userId: "user-demo",
        flowKey: "editor-basics",
        flowVersion: 1,
        source: "automatic",
        resumeId: "practice-one",
        status: "paused",
        currentStep: "format-text",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });

    render(await DashboardPage());

    expect(screen.getByRole("link", { name: "继续练习" })).toHaveAttribute(
      "href",
      "/app/resumes/practice-one",
    );
    expect(screen.getByText("还没有简历")).toBeInTheDocument();
  });

  it("does not render onboarding UI for terminal or ineligible decisions", async () => {
    vi.mocked(prepareEditorOnboardingEntry).mockResolvedValue({
      run: {
        id: "run-ineligible",
        userId: "user-demo",
        flowKey: "editor-basics",
        flowVersion: 1,
        source: "automatic",
        status: "ineligible",
        currentStep: "canvas-intro",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    });

    render(await DashboardPage());

    expect(screen.queryByText("继续编辑器练习")).not.toBeInTheDocument();
  });

  afterEach(async () => {
    await resetResumeRepository();
  });

  it("renders the signed-in dashboard with create and open actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-foundation",
    });
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "classic",
      createId: () => "resume-fullstack",
    });
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "modular",
      createId: () => "resume-frontend",
    });
    await publishResumeRecord("user-demo", "resume-foundation");
    const page = await DashboardPage();

    render(page);

    expect(screen.getByRole("heading", { name: "简历", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("多用户工作区")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "我的简历" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "简历名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "状态" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "最近编辑" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "简介" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument();
    const createButton = screen.getByRole("button", { name: /新\s*建\s*简\s*历/ });
    expect(createButton).toBeInTheDocument();
    expect(getComputedStyle(createButton).borderRadius).toBe(
      "var(--ant-border-radius)",
    );
    expect(getComputedStyle(createButton).fontSize).toBe(
      "var(--ant-button-content-font-size)",
    );
    expect(getComputedStyle(createButton).fontWeight).toBe(
      "var(--ant-button-font-weight)",
    );
    const resumeToolbar = screen.getByRole("toolbar", { name: "简历操作" });
    expect(resumeToolbar).toContainElement(
      screen.getByRole("button", { name: /新\s*建\s*简\s*历/ }),
    );
    expect(resumeToolbar).toContainElement(
      screen.getByRole("searchbox", { name: "搜索简历" }),
    );
    fireEvent.click(screen.getByTestId("open-resume-template-picker"));
    const templateDialog = screen.getByRole("dialog", { name: /^模板中心/ });
    const templateForms = templateDialog.querySelectorAll("form");

    expect(templateForms).toHaveLength(5);
    templateForms.forEach((form) => {
      expect(form).toHaveAttribute("action", "/app/create-resume");
      expect(form).toHaveAttribute("method", "post");
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭模板中心" }));
    const resumeTitleLink = screen.getByRole("link", { name: "居中叙事简历" });
    expect(resumeTitleLink).toHaveAttribute(
      "href",
      "/app/resumes/resume-foundation",
    );
    const titleStyleClass = [...resumeTitleLink.classList].find((className) =>
      className.startsWith("acss-"),
    );
    expect(titleStyleClass).toBeDefined();
    expect(document.head.textContent).toContain(
      `.${titleStyleClass}.${titleStyleClass}`,
    );
    expect(
      getComputedStyle(
        screen.getByRole("searchbox", { name: "搜索简历" }).parentElement!,
      ).flex,
    ).toBe("0 0 360px");
    expect(screen.getAllByRole("link", { name: "打开" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /更多操作：/ })).toHaveLength(3);
    expect(screen.getAllByText("草稿")).toHaveLength(2);
    expect(screen.getByText("已发布")).toBeInTheDocument();
    expect(screen.getAllByRole("time")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "search" })).not.toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "更多操作：居中叙事简历" }));
    expect(screen.getByRole("link", { name: "打开公开页" })).toHaveAttribute(
      "href",
      "/resume/resume-foundation",
    );
    expect(screen.getByTestId("duplicate-resume-form-resume-foundation")).toHaveAttribute(
      "action",
      "/app/resumes/resume-foundation/duplicate",
    );
    fireEvent.click(screen.getByRole("button", { name: /复制公开链接/ }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(
      new URL("/resume/resume-foundation", window.location.origin).href,
    );
    expect(screen.getByTestId("copy-public-link-resume-foundation")).toHaveTextContent(
      "链接已复制",
    );

    act(() => {
      vi.advanceTimersByTime(2_500);
    });
    expect(screen.getByTestId("copy-public-link-resume-foundation")).toHaveTextContent(
      "复制公开链接",
    );
    vi.useRealTimers();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索简历" }), {
      target: { value: "经典" },
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "经典留白简历" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "居中叙事简历" })).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索简历" }), {
      target: { value: "不存在的关键词" },
    });

    await waitFor(() => {
      expect(screen.getByText("没有匹配的简历")).toBeInTheDocument();
    });
  }, 15_000);

  it("renders URL-driven numbered pages", async () => {
    for (let index = 0; index < 21; index += 1) {
      await createResumeRecord("user-demo", `resume-page-${String(index).padStart(2, "0")}`);
    }

    render(
      await DashboardPage({
        searchParams: Promise.resolve({ page: "2" }),
      }),
    );

    expect(screen.getAllByRole("link", { name: "打开" })).toHaveLength(1);
    expect(screen.getByRole("navigation", { name: "分页导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "第 1 页" })).toHaveAttribute(
      "href",
      "/app?page=1",
    );
  });
});
