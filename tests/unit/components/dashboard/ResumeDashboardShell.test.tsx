import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const feedbackMocks = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

const onboardingMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: feedbackMocks.toastError },
  }),
}));

vi.mock("@/lib/onboarding/client", () => ({
  updateEditorOnboardingRunClient: onboardingMocks.update,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: onboardingMocks.push,
    refresh: onboardingMocks.refresh,
  }),
}));

import { ResumeDashboardShell } from "@/components/dashboard/ResumeDashboardShell";

function finishMotion(element: HTMLElement) {
  act(() => {
    for (const eventName of [
      "animationend",
      "webkitAnimationEnd",
      "transitionend",
      "webkitTransitionEnd",
    ]) {
      element.dispatchEvent(new Event(eventName, { bubbles: true }));
    }
  });
}

describe("ResumeDashboardShell", () => {
  beforeEach(() => {
    onboardingMocks.push.mockReset();
    onboardingMocks.refresh.mockReset();
    onboardingMocks.update.mockReset();
    onboardingMocks.update.mockResolvedValue({});
  });

  function installEditorViewport(matches: boolean) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  it("opens the template picker from the toolbar", () => {
    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        resumes={[]}
      />,
    );

    fireEvent.click(screen.getByTestId("open-resume-template-picker"));

    expect(screen.getByRole("dialog", { name: /^模板中心/ })).toBeInTheDocument();
  });

  it("renders a compact editor practice continuation above the catalog", () => {
    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        onboardingContinuation={{
          currentStep: "insert-content",
          href: "/app/resumes/practice-one",
          status: "paused",
        }}
        resumes={[]}
      />,
    );

    const continuation = screen.getByRole("region", {
      name: "继续编辑器练习",
    });
    expect(continuation).toHaveTextContent("从上次停下的位置继续完成编辑练习。");
    expect(within(continuation).getByRole("link", { name: "继续练习" })).toHaveAttribute(
      "href",
      "/app/resumes/practice-one",
    );
    expect(screen.getByText("还没有简历")).toBeInTheDocument();
  });

  it("asks before entering a new editor practice", async () => {
    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        onboardingPrompt={{
          href: "/app/resumes/practice-one",
          runId: "run-one",
        }}
        resumes={[]}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "第一次使用简历编辑器？",
    });
    expect(dialog).toHaveTextContent(
      "你看起来还没有使用过简历编辑器。我们准备了一份练习简历，带你实际完成文字编辑、内容插入、样式调整和预览。",
    );
    expect(dialog).not.toHaveTextContent("不会出现在简历列表");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "开始新手练习" }),
    );

    await waitFor(() => {
      expect(onboardingMocks.update).toHaveBeenCalledWith("run-one", {
        type: "start",
      });
    });
    expect(onboardingMocks.push).toHaveBeenCalledWith(
      "/app/resumes/practice-one",
    );
  });

  it("pauses a prepared editor practice when the user declines it", async () => {
    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        onboardingPrompt={{
          href: "/app/resumes/practice-one",
          runId: "run-one",
        }}
        resumes={[]}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "第一次使用简历编辑器？",
    });
    expect(within(dialog).getByRole("button", { name: "暂时不需要" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "暂时不需要" }));

    await waitFor(() => {
      expect(onboardingMocks.update).toHaveBeenCalledWith("run-one", {
        type: "pause",
      });
      expect(onboardingMocks.refresh).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(dialog).toHaveClass("ant-zoom-leave-active");
    });
    finishMotion(dialog);
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "第一次使用简历编辑器？" }),
      ).not.toBeInTheDocument();
    });
  });

  it("opens the resume import flow separately from template creation", async () => {
    installEditorViewport(false);

    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        resumes={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "导入简历" }));

    const importDialog = screen.getByRole("dialog", { name: "导入简历" });

    expect(within(importDialog).getByRole("button", { name: /Markdown/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /^模板中心/ })).not.toBeInTheDocument();

    fireEvent.click(within(importDialog).getByRole("button", { name: /Markdown/ }));

    expect(
      await screen.findByRole("dialog", { name: "导入 Markdown 简历" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "导入简历" })).not.toBeInTheDocument();
    expect(
      screen
        .getByTestId("create-markdown-resume-form")
        .querySelector('input[name="returnTo"]'),
    ).toHaveValue("/app");

    const markdownDialog = screen.getByRole("dialog", {
      name: "导入 Markdown 简历",
    });
    const modalWrap = markdownDialog.closest(".ant-modal-wrap");

    expect(modalWrap).toBeInstanceOf(HTMLElement);
    fireEvent.mouseDown(modalWrap as HTMLElement);
    fireEvent.click(modalWrap as HTMLElement);

    expect(markdownDialog).toBeInTheDocument();
    await waitFor(() => {
      expect(markdownDialog).toHaveClass("ant-zoom-leave-active");
    });
    finishMotion(markdownDialog);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "导入 Markdown 简历" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "导入简历" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows a creation-oriented empty state for an empty catalog", () => {
    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        resumes={[]}
      />,
    );

    expect(screen.getByText("还没有简历")).toBeInTheDocument();
    expect(screen.getByText("选择一个模板开始创建第一份简历。")).toBeInTheDocument();
    expect(screen.getByTestId("open-empty-resume-template-picker")).toBeInTheDocument();
    expect(screen.queryByText("没有匹配的简历")).not.toBeInTheDocument();
  });

  it("keeps the no-match state for a filtered non-empty catalog", () => {
    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        resumes={[
          {
            id: "resume-one",
            title: "前端简历",
            summary: "React",
            updatedAt: Date.UTC(2026, 7, 31),
            version: 1,
            published: false,
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索简历" }), {
      target: { value: "后端" },
    });

    expect(screen.getByText("没有匹配的简历")).toBeInTheDocument();
    expect(screen.queryByText("还没有简历")).not.toBeInTheDocument();
  });

  it("edits a resume summary from the list without leaving the dashboard", async () => {
    const updateSummary = vi.fn().mockResolvedValue({
      summary: "面向复杂业务的前端平台工程师",
      updatedAt: Date.UTC(2026, 8, 1),
      version: 4,
    });

    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        resumes={[
          {
            id: "resume-one",
            title: "前端简历",
            summary: "React",
            updatedAt: Date.UTC(2026, 7, 31),
            version: 3,
            published: false,
          },
        ]}
        updateSummary={updateSummary}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更多操作：前端简历" }));
    fireEvent.click(await screen.findByRole("button", { name: "编辑简介" }));

    const dialog = screen.getByRole("dialog", { name: "编辑简历简介" });
    const input = screen.getByRole("textbox", { name: "简历简介" });

    expect(dialog).toBeInTheDocument();
    expect(input).toHaveValue("React");
    expect(screen.getByText("5 / 160")).toBeInTheDocument();

    fireEvent.change(input, {
      target: { value: "面向复杂业务的前端平台工程师" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存简介" }));

    await waitFor(() => {
      expect(screen.getByText("面向复杂业务的前端平台工程师")).toBeInTheDocument();
    });
    expect(updateSummary).toHaveBeenCalledWith({
      resumeId: "resume-one",
      summary: "面向复杂业务的前端平台工程师",
      version: 3,
    });
  });

  it("keeps mobile resume links out of the editor and exposes output actions in a more menu", async () => {
    installEditorViewport(false);
    const publishDocument = vi.fn().mockResolvedValue({ slug: "frontend-profile" });
    const unpublishDocument = vi.fn().mockResolvedValue(undefined);
    const exportPdfDocument = vi.fn().mockResolvedValue(undefined);

    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        exportPdfDocument={exportPdfDocument}
        publishDocument={publishDocument}
        resumes={[
          {
            id: "resume-one",
            title: "前端简历",
            summary: "React",
            updatedAt: Date.UTC(2026, 7, 31),
            version: 1,
            published: false,
          },
        ]}
        unpublishDocument={unpublishDocument}
      />,
    );

    expect(screen.getByTestId("dashboard-resume-title-mobile")).toHaveAttribute(
      "href",
      "/app/resumes/resume-one/preview",
    );
    expect(screen.getByTestId("dashboard-resume-primary-mobile")).toHaveAttribute(
      "href",
      "/app/resumes/resume-one/preview",
    );
    expect(screen.getByTestId("dashboard-resume-title-desktop")).toHaveAttribute(
      "href",
      "/app/resumes/resume-one",
    );

    fireEvent.click(screen.getByRole("button", { name: "更多操作：前端简历" }));
    const actions = await screen.findByRole("menu", { name: "更多操作：前端简历" });

    expect(within(actions).getByRole("link", { name: "预览" })).toHaveAttribute(
      "href",
      "/app/resumes/resume-one/preview",
    );
    expect(within(actions).getByRole("button", { name: "PDF" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "发布" })).toBeInTheDocument();
    expect(
      within(actions)
        .getByTestId("duplicate-resume-form-resume-one")
        .querySelector('input[name="returnTo"]'),
    ).toHaveValue("/app");

    fireEvent.click(within(actions).getByRole("button", { name: "PDF" }));
    await waitFor(() => {
      expect(exportPdfDocument).toHaveBeenCalledWith({ resumeId: "resume-one" });
    });

    fireEvent.click(screen.getByRole("button", { name: "更多操作：前端简历" }));
    fireEvent.click(await screen.findByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(publishDocument).toHaveBeenCalledWith({ resumeId: "resume-one" });
      expect(screen.getByText("已发布")).toBeInTheDocument();
    });

    expect(unpublishDocument).not.toHaveBeenCalled();
  });

  it("can unpublish an existing public resume from the more menu", async () => {
    installEditorViewport(false);
    const unpublishDocument = vi.fn().mockResolvedValue(undefined);

    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        resumes={[
          {
            id: "resume-one",
            title: "公开简历",
            summary: "React",
            updatedAt: Date.UTC(2026, 7, 31),
            version: 1,
            published: true,
            slug: "public-profile",
          },
        ]}
        unpublishDocument={unpublishDocument}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更多操作：公开简历" }));
    fireEvent.click(await screen.findByRole("button", { name: "取消发布" }));

    expect(unpublishDocument).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "取消发布简历" });
    expect(within(dialog).getByText(/公开简历/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认取消发布" }));

    await waitFor(() => {
      expect(unpublishDocument).toHaveBeenCalledWith({ resumeId: "resume-one" });
      expect(screen.getByText("草稿")).toBeInTheDocument();
    });
  });

  it("reports a publication failure without leaving an unhandled rejection", async () => {
    installEditorViewport(false);
    const publishDocument = vi.fn().mockRejectedValue(new Error("request_failed"));

    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        publishDocument={publishDocument}
        resumes={[
          {
            id: "resume-one",
            title: "前端简历",
            summary: "React",
            updatedAt: Date.UTC(2026, 7, 31),
            version: 1,
            published: false,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更多操作：前端简历" }));
    fireEvent.click(await screen.findByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(feedbackMocks.toastError).toHaveBeenCalledWith({
        content: "发布失败，请稍后重试。",
        key: "dashboard-publish-error-resume-one",
      });
    });
  });

  it("keeps desktop resume links pointed at the editor", async () => {
    installEditorViewport(true);

    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        resumes={[
          {
            id: "resume-one",
            title: "前端简历",
            summary: "React",
            updatedAt: Date.UTC(2026, 7, 31),
            version: 1,
            published: false,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("dashboard-resume-title-desktop")).toHaveAttribute(
      "href",
      "/app/resumes/resume-one",
    );
    expect(screen.getByTestId("dashboard-resume-primary-desktop")).toHaveAttribute(
      "href",
      "/app/resumes/resume-one",
    );
  });

  it("opens resume actions when the pointer hovers over the more button", async () => {
    render(
      <ResumeDashboardShell
        createAction="/app/create-resume"
        resumes={[
          {
            id: "resume-one",
            title: "前端简历",
            summary: "React",
            updatedAt: Date.UTC(2026, 7, 31),
            version: 1,
            published: false,
          },
        ]}
      />,
    );

    fireEvent.mouseEnter(
      screen.getByRole("button", { name: "更多操作：前端简历" }),
    );

    expect(
      await screen.findByRole("menu", { name: "更多操作：前端简历" }),
    ).toBeInTheDocument();
  });
});
