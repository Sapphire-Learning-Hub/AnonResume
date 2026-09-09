import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const feedbackMocks = vi.hoisted(() => ({
  notificationDestroy: vi.fn(),
  notificationError: vi.fn(),
  notificationWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    notification: {
      destroy: feedbackMocks.notificationDestroy,
      error: feedbackMocks.notificationError,
      warning: feedbackMocks.notificationWarning,
    },
    toast: { error: feedbackMocks.toastError },
  }),
}));

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  ResumeValidationClientError,
  ResumeVersionConflictClientError,
} from "@/lib/resume-client";
import type { RichTextContent } from "@/domain/resume/schema";

import { ResumeEditorShell } from "@/components/editor/ResumeEditorShell";

type RichTextMarks = Extract<
  RichTextContent["content"][number]["content"][number],
  { type: "text" }
>["marks"];

function richText(
  text: string,
  marks?: NonNullable<RichTextMarks>,
): RichTextContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text, marks }],
      },
    ],
  };
}

function createDeferredPromise<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function spacedLabel(text: string) {
  return new RegExp(text.split("").join("\\s*"));
}

function exactSpacedLabel(text: string) {
  return new RegExp(`^${text.split("").join("\\s*")}$`);
}

function getInspectorPanel() {
  const propertiesTab = screen.getByRole("tab", { name: "属性" });

  if (propertiesTab.getAttribute("aria-selected") !== "true") {
    fireEvent.click(propertiesTab);
  }

  return screen.getByTestId("editor-ribbon-property-panel");
}

function openRibbonTab(name: "开始" | "插入" | "布局" | "文档" | "属性") {
  fireEvent.click(screen.getByRole("tab", { name }));
}

class MockResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

describe("ResumeEditorShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the editor shell around the shared canvas", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "简历标题" })).toHaveValue(
      "AnonResume 基础简历",
    );
    expect(screen.getByTestId("resume-editor-shell")).toHaveStyle({
      height: "100dvh",
      overflow: "hidden",
    });
    expect(screen.getByTestId("resume-save-status")).toHaveTextContent("空闲");
    expect(screen.getByRole("tablist", { name: "编辑器功能区" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "开始" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("link", { name: spacedLabel("预览") })).toHaveAttribute(
      "href",
      "/app/resumes/resume-demo/preview",
    );
    expect(screen.getByRole("button", { name: "PDF" })).toBeEnabled();
    expect(screen.getByRole("button", { name: spacedLabel("保存") })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "属性" })).toBeInTheDocument();
    expect(screen.getByText("大纲")).toBeInTheDocument();
    expect(screen.getByText("画布")).toBeInTheDocument();
    expect(screen.queryByTestId("resume-inspector-panel")).not.toBeInTheDocument();
    expect(within(screen.getByRole("article")).getByText("个人简介")).toBeInTheDocument();
    const outlineItem = screen.getByTestId("section-outline-item-section-profile");
    expect(
      within(screen.getByRole("complementary", { name: "大纲" })).queryByRole(
        "button",
        { name: spacedLabel("新增区块") },
      ),
    ).not.toBeInTheDocument();
    expect(outlineItem).toHaveAttribute("role", "group");
    expect(outlineItem).toHaveAttribute("aria-label", "拖动排序 个人简介");
    expect(within(outlineItem).queryByText("个人简介 区块")).not.toBeInTheDocument();
    expect(within(outlineItem).queryByText("显示中")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: exactSpacedLabel("撤销") })).toBeDisabled();
    expect(screen.getByRole("button", { name: exactSpacedLabel("重做") })).toBeDisabled();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("共 1 页")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: spacedLabel("内容编辑") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: spacedLabel("布局排序") })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    openRibbonTab("布局");
    expect(screen.getByRole("button", { name: /重新分页/ })).toBeEnabled();
    openRibbonTab("文档");
    expect(screen.getByRole("button", { name: spacedLabel("发布") })).toBeEnabled();
    expect(screen.getByTestId("resume-publish-action")).toHaveTextContent(/发\s*布/);
    openRibbonTab("属性");
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "基础信息" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("文本格式")).not.toBeInTheDocument();
  });

  it("keeps the two workspace column headers pinned to the top of their panels", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const headers = [
      screen.getByTestId("editor-outline-header"),
      screen.getByTestId("editor-canvas-header"),
    ];

    for (const header of headers) {
      const style = window.getComputedStyle(header);

      expect(style.position).toBe("sticky");
      expect(style.top).toBe("0px");
    }

    expect(
      window.getComputedStyle(screen.getByRole("region", { name: "画布" }))
        .paddingTop,
    ).toBe("0px");
    expect(
      window.getComputedStyle(screen.getByTestId("editor-canvas-header"))
        .paddingTop,
    ).toBe("10px");
    expect(screen.queryByTestId("editor-inspector-header")).not.toBeInTheDocument();
  });

  it("keeps the canvas bottom spacing inside its scroll viewport", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const canvasPanel = screen.getByRole("region", { name: "画布" });
    const canvasHeader = screen.getByTestId("editor-canvas-header");
    const canvasViewport = screen.getByTestId("resume-canvas-zoom").parentElement;
    const panelStyle = window.getComputedStyle(canvasPanel);
    const headerStyle = window.getComputedStyle(canvasHeader);
    const viewportStyle = window.getComputedStyle(canvasViewport!);

    expect(panelStyle.paddingRight).toBe("0px");
    expect(panelStyle.paddingBottom).toBe("0px");
    expect(panelStyle.paddingLeft).toBe("0px");
    expect(headerStyle.paddingRight).toBe("20px");
    expect(headerStyle.paddingLeft).toBe("20px");
    expect(viewportStyle.paddingRight).toBe("20px");
    expect(viewportStyle.paddingBottom).toBe("48px");
    expect(viewportStyle.paddingLeft).toBe("20px");
  });

  it("keeps contextual properties inside the ribbon instead of a workspace column", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const properties = getInspectorPanel();

    expect(properties.closest('[role="tabpanel"]')).toHaveAccessibleName("属性");
    expect(screen.queryByTestId("block-insert-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("resume-inspector-panel")).not.toBeInTheDocument();
  });

  it("organizes document properties into purpose-built ribbon groups", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const properties = getInspectorPanel();
    const documentGroup = within(properties).getByRole("group", {
      name: "基础信息",
    });
    const typographyGroup = within(properties).getByRole("group", {
      name: "字体排版",
    });
    const colorGroup = within(properties).getByRole("group", {
      name: "主题颜色",
    });
    const pageGroup = within(properties).getByRole("group", {
      name: "页面边距",
    });

    expect(within(documentGroup).queryByLabelText("简历标题")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "简历标题" })).toHaveValue(
      "AnonResume 基础简历",
    );
    expect(within(documentGroup).getByLabelText("模板语言")).toBeInTheDocument();
    expect(within(documentGroup).getByLabelText("视觉预设")).toBeInTheDocument();
    expect(within(typographyGroup).getByLabelText("字体族")).toBeInTheDocument();
    expect(within(typographyGroup).getByLabelText("基础字号")).toBeInTheDocument();
    expect(within(typographyGroup).getByLabelText("基础行高")).toBeInTheDocument();
    expect(within(colorGroup).getByLabelText("强调色调色板")).toBeInTheDocument();
    expect(within(colorGroup).getByLabelText("正文颜色调色板")).toBeInTheDocument();
    expect(within(colorGroup).getByLabelText("弱化文本颜色调色板")).toBeInTheDocument();
    expect(within(pageGroup).getByLabelText("页面上边距")).toBeInTheDocument();
    expect(within(pageGroup).getByLabelText("页面右边距")).toBeInTheDocument();
    expect(within(pageGroup).getByLabelText("页面下边距")).toBeInTheDocument();
    expect(within(pageGroup).getByLabelText("页面左边距")).toBeInTheDocument();
  });

  it("keeps controls visually consistent across every ribbon tab", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const ribbon = screen.getByTestId("editor-ribbon");

    for (const tabName of ["开始", "插入", "布局", "文档", "属性"] as const) {
      openRibbonTab(tabName);

      const controls = ribbon.querySelectorAll<HTMLElement>(
        "button, a.ant-btn, input.ant-input, .ant-select-selector, .ant-color-picker-trigger",
      );

      for (const control of controls) {
        const style = window.getComputedStyle(control);

        expect(style.height).toBe("28px");
        expect(style.borderRadius).toBe("6px");

        if (control.getAttribute("aria-label") !== "简历标题") {
          expect(
            style.fontSize,
            `${tabName}: ${control.getAttribute("aria-label") ?? control.textContent ?? control.tagName}`,
          ).toBe("12px");
        }
      }
    }

    expect(
      window.getComputedStyle(screen.getByRole("textbox", { name: "简历标题" }))
        .fontSize,
    ).toBe("14px");
  });

  it("toggles browser fullscreen from the document bar", async () => {
    let fullscreenElement: Element | null = null;
    const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement",
    );
    const requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(
      document.documentElement,
      "requestFullscreen",
    );
    const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "exitFullscreen",
    );
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });

    try {
      render(
        <ResumeEditorShell
          resumeId="resume-demo"
          initialDocument={createDefaultResumeDocument()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "进入全屏" }));

      await waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
      expect(screen.getByRole("button", { name: "退出全屏" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "退出全屏" }));

      await waitFor(() => expect(exitFullscreen).toHaveBeenCalledOnce());
      expect(screen.getByRole("button", { name: "进入全屏" })).toBeInTheDocument();
    } finally {
      if (fullscreenElementDescriptor) {
        Object.defineProperty(document, "fullscreenElement", fullscreenElementDescriptor);
      } else {
        Reflect.deleteProperty(document, "fullscreenElement");
      }

      if (requestFullscreenDescriptor) {
        Object.defineProperty(
          document.documentElement,
          "requestFullscreen",
          requestFullscreenDescriptor,
        );
      } else {
        Reflect.deleteProperty(document.documentElement, "requestFullscreen");
      }

      if (exitFullscreenDescriptor) {
        Object.defineProperty(document, "exitFullscreen", exitFullscreenDescriptor);
      } else {
        Reflect.deleteProperty(document, "exitFullscreen");
      }
    }
  });

  it("toggles the non-layout print safe-area guide on the canvas", () => {
    const { container } = render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );
    openRibbonTab("布局");
    const safeAreaButton = screen.getByRole("button", { name: "打印安全区" });

    expect(safeAreaButton).toHaveAttribute("aria-pressed", "false");
    expect(
      container.querySelector("[data-resume-print-safe-area='true']"),
    ).not.toBeInTheDocument();

    fireEvent.click(safeAreaButton);

    expect(safeAreaButton).toHaveAttribute("aria-pressed", "true");
    expect(
      container.querySelector("[data-resume-print-safe-area='true']"),
    ).toBeInTheDocument();
  });

  it("saves pending changes from the toolbar button and Ctrl+S", async () => {
    const saveDocument = vi
      .fn()
      .mockResolvedValueOnce({ version: 2, updatedAt: 800 })
      .mockResolvedValueOnce({ version: 3, updatedAt: 900 });

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        autosaveDelayMs={10_000}
        draftRepository={{
          getDraft: async () => undefined,
          saveDraft: async () => undefined,
          deleteDraft: async () => undefined,
        }}
        saveDocument={saveDocument}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));

    const saveButton = screen.getByRole("button", { name: spacedLabel("保存") });

    expect(saveButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(saveButton);
      await Promise.resolve();
    });

    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));

    await act(async () => {
      const dispatched = fireEvent.keyDown(window, {
        key: "s",
        ctrlKey: true,
      });

      expect(dispatched).toBe(false);
      await Promise.resolve();
    });

    expect(saveDocument).toHaveBeenCalledTimes(2);
    expect(screen.getByText("已保存")).toBeInTheDocument();
  });

  it("saves pending content before editing the shared resume summary", async () => {
    const saveDocument = vi
      .fn()
      .mockResolvedValueOnce({ version: 4, updatedAt: 800 })
      .mockResolvedValueOnce({ version: 6, updatedAt: 1000 });
    const updateSummary = vi.fn().mockResolvedValue({
      summary: "面向复杂业务的前端平台工程师",
      updatedAt: 900,
      version: 5,
    });

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        initialSummary="旧简介"
        initialVersion={3}
        autosaveDelayMs={10_000}
        draftRepository={{
          getDraft: async () => undefined,
          saveDraft: async () => undefined,
          deleteDraft: async () => undefined,
        }}
        saveDocument={saveDocument}
        updateSummary={updateSummary}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));
    openRibbonTab("文档");
    fireEvent.click(screen.getByRole("button", { name: "编辑简介" }));
    fireEvent.change(screen.getByRole("textbox", { name: "简历简介" }), {
      target: { value: "面向复杂业务的前端平台工程师" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存简介" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveDocument).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ version: 3 }),
    );
    expect(updateSummary).toHaveBeenCalledWith({
      resumeId: "resume-demo",
      summary: "面向复杂业务的前端平台工程师",
      version: 4,
    });

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));

    await act(async () => {
      fireEvent.click(screen.getByTitle("保存（⌘/Ctrl+S）"));
      await Promise.resolve();
    });

    expect(saveDocument).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ version: 5 }),
    );
  });

  it("warns before leaving the page only when edits are unsaved", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        autosaveDelayMs={10_000}
      />,
    );

    expect(
      window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    ).toBe(true);

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));

    expect(
      window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    ).toBe(false);
  });

  it("supports global undo and redo shortcuts without intercepting input editing", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        autosaveDelayMs={10_000}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));
    expect(screen.getByRole("button", { name: "新区块" })).toBeInTheDocument();

    const undoEvent = fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    expect(undoEvent).toBe(false);
    expect(screen.queryByRole("button", { name: "新区块" })).not.toBeInTheDocument();

    const redoEvent = fireEvent.keyDown(window, {
      key: "z",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(redoEvent).toBe(false);
    expect(screen.getByRole("button", { name: "新区块" })).toBeInTheDocument();

    const nativeInput = document.createElement("input");

    document.body.append(nativeInput);
    const inputUndoEvent = fireEvent.keyDown(nativeInput, { key: "z", ctrlKey: true });
    nativeInput.remove();

    expect(inputUndoEvent).toBe(true);
    expect(screen.getByRole("button", { name: "新区块" })).toBeInTheDocument();
  });

  it("creates a restore point from the version history panel", async () => {
    const loadVersionSnapshots = vi
      .fn()
      .mockResolvedValueOnce({
        items: [{ id: "snapshot-1", version: 3, createdAt: 800 }],
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      })
      .mockResolvedValueOnce({
        items: [
          { id: "snapshot-2", version: 3, createdAt: 900 },
          { id: "snapshot-1", version: 3, createdAt: 800 },
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });
    const createVersionSnapshot = vi.fn().mockResolvedValue({
      id: "snapshot-2",
      version: 3,
      createdAt: 900,
    });

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        autosaveDelayMs={10_000}
        draftRepository={{
          getDraft: async () => undefined,
          saveDraft: async () => undefined,
          deleteDraft: async () => undefined,
        }}
        loadVersionSnapshots={loadVersionSnapshots}
        createVersionSnapshot={createVersionSnapshot}
        versionHistoryLimit={7}
      />,
    );

    openRibbonTab("文档");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("历史记录") }));

    expect(loadVersionSnapshots).toHaveBeenCalledWith("resume-demo", {
      page: 1,
      pageSize: 20,
    });
    expect(await screen.findByText("版本 3")).toBeInTheDocument();
    expect(
      screen.getByText("最多保留 7 个恢复点；超出后会自动移除最早的记录。"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: spacedLabel("创建恢复点") }));

    await waitFor(() =>
      expect(createVersionSnapshot).toHaveBeenCalledWith("resume-demo"),
    );
    await waitFor(() => expect(loadVersionSnapshots).toHaveBeenCalledTimes(2));
  });

  it("compares a selected history snapshot with the current editor document", async () => {
    const currentDocument = createDefaultResumeDocument();
    const historicalDocument = createDefaultResumeDocument();

    currentDocument.meta.title = "Current document";
    historicalDocument.meta.title = "Historical document";

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={currentDocument}
        loadVersionSnapshots={async () => ({
          items: [{ id: "snapshot-1", version: 3, createdAt: 800 }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        })}
        loadVersionSnapshot={async () => ({
          id: "snapshot-1",
          version: 3,
          createdAt: 800,
          document: historicalDocument,
        })}
      />,
    );

    openRibbonTab("文档");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("历史记录") }));
    fireEvent.click(
      await screen.findByRole("button", { name: spacedLabel("查看差异") }),
    );

    const dialog = (await screen.findByText("版本差异")).closest(
      "[role='dialog']",
    ) as HTMLElement;

    expect(within(dialog).getByText("Historical document")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Current document").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("历史版本").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("当前内容").length).toBeGreaterThan(0);
  });

  it("does not expose the removed resume check feature", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: spacedLabel("简历检查") }),
    ).not.toBeInTheDocument();
  });

  it("links to the workspace from the editor toolbar", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    expect(screen.getByRole("link", { name: "返回工作台" })).toHaveAttribute(
      "href",
      "/app",
    );
  });

  it("exposes only the outline and canvas as named editor workspaces", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    expect(screen.getByRole("complementary", { name: "大纲" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "画布" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "检查器" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "属性" })).toBeInTheDocument();
  });

  it("updates the editor zoom controls and scales the canvas viewport", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const zoomViewport = screen.getByTestId("resume-canvas-zoom");

    expect(zoomViewport).toHaveStyle({
      transform: "scale(1)",
    });
    expect(screen.getByRole("button", { name: spacedLabel("缩小") })).toBeEnabled();
    expect(screen.getByRole("button", { name: spacedLabel("放大") })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: spacedLabel("放大") }));

    expect(screen.getByText("110%")).toBeInTheDocument();
    expect(zoomViewport).toHaveStyle({
      transform: "scale(1.1)",
    });

    fireEvent.click(screen.getByRole("button", { name: spacedLabel("重置缩放") }));

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(zoomViewport).toHaveStyle({
      transform: "scale(1)",
    });
  });

  it("shows document settings in the inspector when nothing is selected", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const dialog = getInspectorPanel();

    expect(within(dialog).getByRole("group", { name: "基础信息" })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("简历标题")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "简历标题" })).toHaveValue(
      "AnonResume 基础简历",
    );
    const templateLanguageSelect = within(dialog).getByTestId(
      "document-template-language-select",
    );
    expect(templateLanguageSelect).toHaveTextContent("简体中文");
    expect(templateLanguageSelect.closest("[data-field-size]")).toHaveAttribute(
      "data-field-size",
      "select-medium",
    );
    expect(within(dialog).getByLabelText("查看模板语言说明")).toBeInTheDocument();
    const visualPresetSelect = within(dialog).getByTestId(
      "document-visual-preset-select",
    );
    expect(visualPresetSelect).toHaveTextContent("专业平衡");
    expect(visualPresetSelect.closest("[data-field-size]")).toHaveAttribute(
      "data-field-size",
      "select-medium",
    );
    const fontFamilySelect = within(dialog).getByTestId(
      "document-font-family-select",
    );
    expect(fontFamilySelect).toHaveTextContent("IBM Plex Sans");
    expect(fontFamilySelect).not.toHaveTextContent("商务无衬线");
    expect(fontFamilySelect).not.toHaveTextContent("商用免费");
    expect(fontFamilySelect.closest("[data-field-size]")).toHaveAttribute(
      "data-field-size",
      "select-wide",
    );
    expect(within(dialog).getByLabelText("基础字号")).toHaveValue(14);
    expect(within(dialog).getByLabelText("基础行高")).toHaveValue("1.45");
  });

  it("allows clearing a required document setting before typing its replacement", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const dialog = getInspectorPanel();
    const titleInput = screen.getByRole("textbox", { name: "简历标题" });
    const baseFontSizeInput = within(dialog).getByLabelText("基础字号");
    const baseLineHeightInput = within(dialog).getByLabelText("基础行高");

    fireEvent.change(titleInput, { target: { value: "" } });
    fireEvent.change(baseFontSizeInput, { target: { value: "" } });
    fireEvent.change(baseLineHeightInput, { target: { value: "" } });

    expect(titleInput).toHaveValue("");
    expect(baseFontSizeInput).toHaveValue(null);
    expect(baseLineHeightInput).toHaveValue("");

    fireEvent.change(titleInput, { target: { value: "Platform Resume" } });
    fireEvent.change(baseFontSizeInput, { target: { value: "16" } });
    fireEvent.change(baseLineHeightInput, { target: { value: "1.6" } });

    expect(titleInput).toHaveValue("Platform Resume");
    expect(baseFontSizeInput).toHaveValue(16);
    expect(baseLineHeightInput).toHaveValue("1.6");
    expect(screen.getByRole("article")).toHaveStyle({
      "--resume-base-font-size": "16px",
      "--resume-line-height": "1.6",
    });
  });

  it("applies a licensed font preset to the rendered resume", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const dialog = getInspectorPanel();
    const fontFamilySelect = within(dialog).getByTestId(
      "document-font-family-select",
    );

    expect(fontFamilySelect).toHaveTextContent("IBM Plex Sans");

    fireEvent.mouseDown(
      within(dialog).getByRole("combobox", { name: "字体族" }),
    );
    fireEvent.click(screen.getByText("Noto Serif SC"));

    expect(fontFamilySelect).toHaveTextContent("Noto Serif SC");
    expect(screen.getByRole("article")).toHaveStyle({
      "--resume-font-family":
        "var(--font-noto-serif-sc), var(--font-noto-sans-sc), serif",
    });
  });

  it("filters licensed font presets from the font family input", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const fontFamilyInput = within(getInspectorPanel()).getByRole("combobox", {
      name: "字体族",
    });

    fireEvent.mouseDown(fontFamilyInput);
    fireEvent.change(fontFamilyInput, { target: { value: "中文宋体" } });

    expect(screen.getByText("Noto Serif SC")).toBeInTheDocument();
    expect(screen.queryByText("Manrope")).not.toBeInTheDocument();
  });

  it("opens document properties from the document tab and clears contextual selection", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "文本样式" }),
    ).toBeInTheDocument();
    openRibbonTab("文档");
    fireEvent.click(screen.getByRole("button", { name: "文档属性" }));

    const propertyPanel = getInspectorPanel();

    expect(screen.getByRole("tab", { name: "属性" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(propertyPanel).queryByRole("heading")).not.toBeInTheDocument();
    expect(
      within(propertyPanel).queryByRole("button", { name: "文档设置" }),
    ).not.toBeInTheDocument();
    expect(within(propertyPanel).queryByLabelText("简历标题")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "简历标题" })).toHaveValue(
      "AnonResume 基础简历",
    );
  });

  it("updates document settings from the inspector and reflects them on the canvas", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const dialog = getInspectorPanel();

    fireEvent.change(screen.getByRole("textbox", { name: "简历标题" }), {
      target: { value: "Platform Resume" },
    });
    fireEvent.mouseDown(
      within(dialog).getByRole("combobox", { name: "字体族" }),
    );
    fireEvent.click(screen.getByText("Noto Sans SC"));
    fireEvent.change(within(dialog).getByLabelText("基础字号"), {
      target: { value: "16" },
    });
    fireEvent.change(within(dialog).getByLabelText("基础行高"), {
      target: { value: "1.8" },
    });
    fireEvent.change(within(dialog).getByLabelText("页面上边距"), {
      target: { value: "40" },
    });
    fireEvent.change(within(dialog).getByLabelText("页面右边距"), {
      target: { value: "36" },
    });
    fireEvent.change(within(dialog).getByLabelText("页面下边距"), {
      target: { value: "28" },
    });
    fireEvent.change(within(dialog).getByLabelText("页面左边距"), {
      target: { value: "24" },
    });

    const templateLanguage = within(dialog).getByRole("combobox", {
      name: "模板语言",
    });
    const templateLanguageSelect = within(dialog).getByTestId(
      "document-template-language-select",
    );

    fireEvent.mouseDown(templateLanguage);
    fireEvent.click(screen.getByText("English"));

    const canvas = screen.getByRole("article");

    expect(screen.getByRole("textbox", { name: "简历标题" })).toHaveValue(
      "Platform Resume",
    );
    expect(templateLanguageSelect).toHaveTextContent("English");
    expect(
      within(dialog).getByTestId("document-font-family-select"),
    ).toHaveTextContent("Noto Sans SC");
    expect(canvas).toHaveStyle({
      "--resume-font-family": "var(--font-noto-sans-sc), sans-serif",
      "--resume-base-font-size": "16px",
      "--resume-line-height": "1.8",
      "--resume-page-padding": "40px 36px 28px 24px",
    });
    expect(
      within(dialog).getByTestId("document-visual-preset-select"),
    ).toHaveTextContent("自定义（已微调）");
  });

  it("applies a visual preset as one document setting change", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const dialog = getInspectorPanel();
    const visualPreset = within(dialog).getByRole("combobox", {
      name: "视觉预设",
    });

    fireEvent.mouseDown(visualPreset);
    fireEvent.click(screen.getByText("紧凑高密度"));

    expect(within(dialog).getByTestId("document-visual-preset-select")).toHaveTextContent(
      "紧凑高密度",
    );
    expect(within(dialog).getByLabelText("基础字号")).toHaveValue(13);
    expect(within(dialog).getByLabelText("基础行高")).toHaveValue("1.35");
    expect(within(dialog).getByLabelText("页面上边距")).toHaveValue(24);
    expect(screen.getByRole("article")).toHaveStyle({
      "--resume-page-padding": "24px 28px 24px 28px",
    });
  });

  it("shows unpublish controls when a published slug is available", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-foundation"
        publicSlug="foundation-resume"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    openRibbonTab("文档");

    expect(screen.getByRole("button", { name: spacedLabel("取消发布") })).toBeEnabled();
    expect(screen.getByTestId("resume-publish-action")).toHaveTextContent(
      /取\s*消\s*发\s*布/,
    );
    expect(screen.getByRole("link", { name: spacedLabel("打开公开页") })).toHaveAttribute(
      "href",
      "/resume/foundation-resume",
    );
    expect(screen.getByTestId("resume-open-public")).toHaveAttribute(
      "href",
      "/resume/foundation-resume",
    );
  });

  it("copies the public URL directly from the published editor", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <ResumeEditorShell
        resumeId="resume-foundation"
        publicSlug="foundation-resume"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    openRibbonTab("文档");

    fireEvent.click(screen.getByRole("button", { name: "复制公开链接" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/resume/foundation-resume",
      ),
    );
    expect(screen.getByRole("button", { name: "公开链接已复制" })).toBeInTheDocument();
  });

  it("publishes the current resume and reveals the public link", async () => {
    const publishDocument = vi
      .fn()
      .mockResolvedValue({ slug: "resume-demo" });

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        publishDocument={publishDocument}
      />,
    );

    openRibbonTab("文档");

    fireEvent.click(screen.getByRole("button", { name: spacedLabel("发布") }));

    await waitFor(() =>
      expect(publishDocument).toHaveBeenCalledWith({ resumeId: "resume-demo" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByTestId("resume-publish-action")).toHaveTextContent(
      "取消发布",
    );
    expect(await screen.findByRole("link", { name: spacedLabel("打开公开页") })).toHaveAttribute(
      "href",
      "/resume/resume-demo",
    );
    expect(await screen.findByTestId("resume-open-public")).toHaveAttribute(
      "href",
      "/resume/resume-demo",
    );
  });

  it("reuses an in-flight autosave before publishing", async () => {
    vi.useFakeTimers();

    const firstSave = createDeferredPromise<{
      version: number;
      updatedAt: number;
    }>();
    const saveDocument = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue({
        version: 2,
        updatedAt: 1000,
      });
    const publishDocument = vi.fn().mockResolvedValue({
      slug: "resume-demo",
    });

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        autosaveDelayMs={1}
        draftRepository={{
          getDraft: async () => undefined,
          saveDraft: async () => undefined,
          deleteDraft: async () => undefined,
        }}
        saveDocument={saveDocument}
        publishDocument={publishDocument}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));
    openRibbonTab("文档");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveDocument).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: spacedLabel("发布") }));
      await Promise.resolve();
    });

    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(publishDocument).not.toHaveBeenCalled();

    await act(async () => {
      firstSave.resolve({
        version: 2,
        updatedAt: 1000,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(publishDocument).toHaveBeenCalledWith({ resumeId: "resume-demo" });
    expect(screen.getByTestId("resume-open-public")).toHaveAttribute(
      "href",
      "/resume/resume-demo",
    );
  });

  it("exports pdf after saving dirty changes", async () => {
    const saveDocument = vi.fn().mockResolvedValue({
      version: 2,
      updatedAt: 1000,
    });
    const exportPdfDocument = vi.fn().mockResolvedValue(undefined);

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        autosaveDelayMs={999999}
        saveDocument={saveDocument}
        exportPdfDocument={exportPdfDocument}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    expect(await screen.findByText("已保存")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(saveDocument).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(exportPdfDocument).toHaveBeenCalledWith({ resumeId: "resume-demo" }),
    );
  });

  it("shows a conflict banner when autosave hits a stale server version", async () => {
    const cloudDocument = createDefaultResumeDocument();
    cloudDocument.meta.title = "Latest cloud title";
    const loadCurrentResume = vi.fn().mockResolvedValue({
      document: cloudDocument,
      version: 7,
      updatedAt: 1200,
    });

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        autosaveDelayMs={1}
        draftRepository={{
          getDraft: async () => undefined,
          saveDraft: async () => undefined,
          deleteDraft: async () => undefined,
        }}
        saveDocument={async () => {
          throw new ResumeVersionConflictClientError(7);
        }}
        loadCurrentResume={loadCurrentResume}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));

    await waitFor(() => expect(loadCurrentResume).toHaveBeenCalledWith("resume-demo"));

    await waitFor(() => {
      expect(feedbackMocks.notificationWarning).toHaveBeenLastCalledWith(
        expect.objectContaining({
          description: "最新云端版本为 7。本地编辑仍保留在浏览器草稿中。",
          duration: false,
          key: "editor-version-conflict",
          title: "检测到云端版本冲突",
        }),
      );
    });
    const conflictNotification = feedbackMocks.notificationWarning.mock.calls.at(-1)?.[0];
    const actions = render(conflictNotification.actions);
    const viewDiffButton = within(actions.container).getByRole("button", {
      name: /查看差异/,
    });
    expect(viewDiffButton).toBeEnabled();
    fireEvent.click(viewDiffButton);

    const dialog = (await screen.findByText("版本差异")).closest(
      "[role='dialog']",
    ) as HTMLElement;
    expect(within(dialog).getByText("Latest cloud title")).toBeInTheDocument();
    expect(within(dialog).getAllByText("云端版本").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("本地版本").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: spacedLabel("关闭") }));
  });

  it("shows a validation banner when autosave payload is rejected", async () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        autosaveDelayMs={1}
        draftRepository={{
          getDraft: async () => undefined,
          saveDraft: async () => undefined,
          deleteDraft: async () => undefined,
        }}
        saveDocument={async () => {
          throw new ResumeValidationClientError([
            {
              code: "invalid_color",
              path: "settings.theme.accent",
              message: "强调色必须是有效的十六进制颜色值。",
            },
          ]);
        }}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));

    await waitFor(() => {
      expect(feedbackMocks.notificationError).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "强调色必须是有效的十六进制颜色值。",
          duration: false,
          key: "editor-save-validation",
          title: "简历校验失败",
        }),
      );
    });
  });

  it("updates inspector content when selecting a section from the outline", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "个人简介" }),
    );
    const dialog = getInspectorPanel();

    expect(within(dialog).getByRole("group", { name: "区块布局" })).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(within(dialog).getByLabelText("分栏数")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("区块间距")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: spacedLabel("隐藏区块") })).toBeEnabled();
    expect(within(dialog).queryByText("语义")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("profile")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("可见性")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("区块语义")).not.toBeInTheDocument();
  });

  it("updates section layout from the inspector and reflects it on the canvas", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "个人简介" }));
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "区块布局" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("区块间距"), {
      target: { value: "28" },
    });
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("横向布局") }));

    const canvas = screen.getByRole("article");
    const blockStack = within(canvas).getByTestId("section-block-stack-section-profile");

    expect(blockStack).toHaveStyle({
      flexDirection: "row",
      gap: "28px",
    });
  });

  it("updates section columns from the inspector and reflects them on the canvas", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "个人简介" }));
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "区块布局" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("分栏数"), {
      target: { value: "2" },
    });

    const canvas = screen.getByRole("article");
    const blockStack = within(canvas).getByTestId("section-block-stack-section-profile");

    expect(blockStack).toHaveStyle({
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    });
  });

  it("updates section padding from the inspector and reflects it on the canvas", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "个人简介" }));
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "区块布局" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("上内边距"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("右内边距"), {
      target: { value: "16" },
    });
    fireEvent.change(screen.getByLabelText("下内边距"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("左内边距"), {
      target: { value: "24" },
    });

    const canvas = screen.getByRole("article");
    const section = within(canvas).getByTestId("resume-section-section-profile");

    expect(section).toHaveStyle({
      paddingTop: "12px",
      paddingRight: "16px",
      paddingBottom: "20px",
      paddingLeft: "24px",
    });
  });

  it("lets the user edit a section title directly on the canvas", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const canvas = screen.getByRole("article");
    const sectionTitle = within(canvas).getByText("个人简介");

    fireEvent.click(sectionTitle.closest("button")!);

    const editor = screen.getByRole("textbox", { name: "文本块编辑器" });

    expect(editor).toHaveTextContent("个人简介");
    const dialog = getInspectorPanel();
    expect(within(dialog).getByRole("group", { name: "区块操作" })).toBeInTheDocument();
    openRibbonTab("开始");
    expect(screen.getByRole("tabpanel", { name: "开始" })).toHaveTextContent("文本格式");
    expect(screen.getByRole("button", { name: spacedLabel("加粗") })).toBeEnabled();
  });

  it("shows the selected section title color in the ribbon", () => {
    const document = createDefaultResumeDocument();
    Object.assign(document.sections[0]!, {
      titleStyle: { color: "#be123c" },
    });

    render(
      <ResumeEditorShell resumeId="resume-demo" initialDocument={document} />,
    );

    const canvas = screen.getByRole("article");
    fireEvent.click(within(canvas).getByText("个人简介").closest("button")!);

    expect(screen.getByLabelText("区块标题颜色调色板")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    expect(screen.getByLabelText("区块标题颜色调色板")).toHaveAttribute(
      "data-color-value",
      "#be123c",
    );
  });

  it("shows a tiptap editor when selecting a text block from the canvas", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));

    const editor = screen.getByRole("textbox", { name: "文本块编辑器" });

    expect(editor.tagName).toBe("DIV");
    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(editor).toHaveTextContent("共享渲染器基础");
    const dialog = getInspectorPanel();
    expect(within(dialog).getByRole("group", { name: "文本样式" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Block 类型")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Block 路径")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("block-profile-summary")).not.toBeInTheDocument();
  });

  it("adds reusable child components after the selected content", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));

    openRibbonTab("插入");
    const insertPanel = screen.getByRole("tabpanel", { name: "插入" });

    expect(within(insertPanel).getByRole("button", { name: spacedLabel("文本") })).toBeEnabled();
    expect(within(insertPanel).getByRole("button", { name: spacedLabel("标签") })).toBeEnabled();
    expect(within(insertPanel).getByRole("button", { name: "分点列表" })).toBeEnabled();
    expect(within(insertPanel).getByRole("button", { name: "内容组" })).toBeEnabled();
    expect(within(insertPanel).getByRole("button", { name: "双列内容" })).toBeEnabled();

    fireEvent.click(within(insertPanel).getByRole("button", { name: spacedLabel("标签") }));

    expect(screen.getByRole("button", { name: "编辑标签 新标签" })).toBeInTheDocument();
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "标签内容" }),
    ).toBeInTheDocument();
  });

  it("updates the selected text block styles from the inspector", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    const dialog = getInspectorPanel();

    fireEvent.change(within(dialog).getByLabelText("字号"), {
      target: { value: "24" },
    });
    fireEvent.change(within(dialog).getByLabelText("字重"), {
      target: { value: "800" },
    });
    fireEvent.change(within(dialog).getByLabelText("行高"), {
      target: { value: "1.25" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: spacedLabel("居中对齐") }));

    expect(screen.getByRole("textbox", { name: "文本块编辑器" })).toHaveStyle({
      fontSize: "24px",
      fontWeight: "800",
      lineHeight: "1.25",
      textAlign: "center",
    });
  });

  it("edits badge text from the inspector without replacing the canvas chip", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑标签 Next.js" }));

    const dialog = getInspectorPanel();

    expect(within(dialog).getByRole("group", { name: "标签内容" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("标签文本")).toHaveValue("Next.js");

    fireEvent.change(within(dialog).getByLabelText("标签文本"), {
      target: { value: "TypeScript" },
    });

    expect(screen.getByRole("button", { name: "编辑标签 TypeScript" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑标签 Next.js" })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "新增标签" }));

    expect(screen.getByRole("button", { name: "编辑标签 新标签" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "删除标签" }));

    expect(screen.queryByRole("button", { name: "编辑标签 新标签" })).not.toBeInTheDocument();
  });

  it("allows clearing badge text before typing its replacement", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑标签 Next.js" }));

    const badgeInput = within(getInspectorPanel()).getByLabelText("标签文本");

    fireEvent.change(badgeInput, { target: { value: "" } });
    expect(badgeInput).toHaveValue("");

    fireEvent.change(badgeInput, { target: { value: "TypeScript" } });

    expect(badgeInput).toHaveValue("TypeScript");
    expect(screen.getByRole("button", { name: "编辑标签 TypeScript" })).toBeInTheDocument();
  });

  it("provides a palette for every editable color field", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    const dialog = getInspectorPanel();
    const themeColors = within(dialog).getByTestId("document-theme-colors");

    expect(themeColors).not.toHaveTextContent("主题配色");
    expect(within(themeColors).getByText("强调")).toBeInTheDocument();
    expect(within(themeColors).getByText("正文")).toBeInTheDocument();
    expect(within(themeColors).getByText("弱化")).toBeInTheDocument();
    const colorControls = [
      within(themeColors).getByLabelText("强调色调色板"),
      within(themeColors).getByLabelText("正文颜色调色板"),
      within(themeColors).getByLabelText("弱化文本颜色调色板"),
    ];

    for (const colorControl of colorControls) {
      expect(window.getComputedStyle(colorControl).height).toBe("28px");
      expect(window.getComputedStyle(colorControl).borderRadius).toBe("6px");
      const wrapperStyle = window.getComputedStyle(colorControl.parentElement!);

      expect(wrapperStyle).toHaveProperty("border-radius", "6px");
      expect(wrapperStyle).toHaveProperty("padding", "0px");
      expect(wrapperStyle).toHaveProperty("overflow", "hidden");
    }
    expect(within(dialog).queryByLabelText("强调色")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("正文颜色")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("弱化文本颜色")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByLabelText("强调色调色板"));
    const preset = document.querySelectorAll(".ant-color-picker-presets-color")[1];

    expect(preset).toBeDefined();
    fireEvent.click(preset);

    expect(screen.getByRole("article")).toHaveStyle({
      "--resume-accent": "#2563eb",
    });

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));

    expect(within(dialog).getByLabelText("文本颜色调色板")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("文本颜色")).not.toBeInTheDocument();
  });

  it("allows decimal line-height input without dropping the trailing decimal point", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    const dialog = getInspectorPanel();
    const lineHeightInput = within(dialog).getByLabelText("行高");

    fireEvent.change(lineHeightInput, {
      target: { value: "1." },
    });

    expect(lineHeightInput).toHaveValue("1.");

    fireEvent.change(lineHeightInput, {
      target: { value: "1.25" },
    });

    expect(lineHeightInput).toHaveValue("1.25");
    expect(screen.getByRole("textbox", { name: "文本块编辑器" })).toHaveStyle({
      lineHeight: "1.25",
    });
  });

  it("disables contextual ribbon text controls until a text block is selected", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    expect(screen.getByRole("button", { name: spacedLabel("加粗") })).toBeDisabled();
    expect(screen.getByRole("button", { name: spacedLabel("斜体") })).toBeDisabled();
    expect(screen.getByRole("button", { name: spacedLabel("下划线") })).toBeDisabled();
    expect(screen.getByRole("button", { name: spacedLabel("删除线") })).toBeDisabled();
    expect(screen.getByRole("button", { name: spacedLabel("内联标签") })).toBeDisabled();
    expect(screen.getByLabelText("文本颜色调色板")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "链接" })).toBeDisabled();
    expect(screen.getByRole("button", { name: spacedLabel("应用链接") })).toBeDisabled();
    expect(screen.getByRole("button", { name: spacedLabel("清除链接") })).toBeDisabled();
  });

  it("enables rich text toolbar controls when a text block is selected", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    expect(screen.getByRole("button", { name: spacedLabel("加粗") })).toBeEnabled();
    expect(screen.getByRole("button", { name: spacedLabel("斜体") })).toBeEnabled();
    expect(screen.getByRole("button", { name: spacedLabel("下划线") })).toBeEnabled();
    expect(screen.getByRole("button", { name: spacedLabel("删除线") })).toBeEnabled();
    expect(screen.getByRole("button", { name: spacedLabel("内联标签") })).toBeEnabled();
    expect(screen.getByLabelText("文本颜色调色板")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    expect(screen.getByRole("textbox", { name: "链接" })).toBeEnabled();
    expect(screen.getByRole("button", { name: spacedLabel("应用链接") })).toBeEnabled();
    expect(screen.getByRole("button", { name: spacedLabel("清除链接") })).toBeEnabled();
    expect(within(getInspectorPanel()).getByRole("button", { name: spacedLabel("复制区块") })).toBeEnabled();
  });

  it("keeps the ribbon color picker bound to the whole block color", () => {
    const document = createDefaultResumeDocument();
    const summary = document.sections[0]?.blocks[0];

    if (!summary || summary.type !== "text") {
      throw new Error("Expected the profile summary text block");
    }

    summary.style = { ...summary.style, color: "#2563eb" };
    summary.content.content[0]!.content = [
      {
        type: "text",
        text: "共享渲染器基础",
        marks: [{ type: "textColor", attrs: { color: "#be123c" } }],
      },
    ];

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={document}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));

    expect(screen.getByLabelText("文本颜色调色板")).toHaveAttribute(
      "data-color-value",
      "#2563eb",
    );
  });

  it("opens the icon library for the active text editor and inserts an icon", async () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: spacedLabel("插入图标"),
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: "图标库" });
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "搜索图标" }), {
      target: { value: "邮箱" },
    });
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "插入 邮箱" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("article").querySelector(
          '[data-resume-icon-id="lucide:mail"]',
        ),
      ).toBeInTheDocument();
    });
  });

  it("duplicates the selected section from the inspector", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    fireEvent.click(
      within(getInspectorPanel()).getByRole("button", { name: spacedLabel("复制区块") }),
    );

    expect(screen.getAllByRole("group", { name: "拖动排序 个人简介" })).toHaveLength(2);
  });

  it("duplicates selected content beside its source from the inspector", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    fireEvent.click(
      within(getInspectorPanel()).getByRole("button", { name: spacedLabel("复制内容") }),
    );

    expect(screen.getAllByRole("button", { name: "共享渲染器基础" })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "文本块编辑器" })).toHaveTextContent(
      "共享渲染器基础",
    );
  });

  it("deletes a selected bullet as a whole list item", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "基于流式布局的结构化简历编辑基础能力",
      }),
    );
    fireEvent.click(
      within(getInspectorPanel()).getByRole("button", { name: spacedLabel("删除内容") }),
    );

    expect(
      screen.queryByRole("button", {
        name: "基于流式布局的结构化简历编辑基础能力",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "文本块编辑器" })).toHaveTextContent(
      "编辑、预览与打印三种模式共享同一渲染契约",
    );
  });

  it("allows deleting the final bullet and removes its empty list", () => {
    const initialDocument = createDefaultResumeDocument();
    const list = initialDocument.sections[0]?.blocks[1];

    if (list?.type !== "list") {
      throw new Error("Expected profile highlights to remain a list.");
    }

    list.items = [list.items[0]!];

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={initialDocument}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "基于流式布局的结构化简历编辑基础能力",
      }),
    );
    const deleteButton = within(getInspectorPanel()).getByRole("button", {
      name: spacedLabel("删除内容"),
    });

    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);

    expect(
      screen.queryByRole("button", {
        name: "基于流式布局的结构化简历编辑基础能力",
      }),
    ).not.toBeInTheDocument();
  });

  it("allows deleting the final badge and removes its empty badge block", () => {
    const initialDocument = createDefaultResumeDocument();
    const badges = initialDocument.sections[0]?.blocks[2];

    if (badges?.type !== "badges") {
      throw new Error("Expected profile stack to remain a badge block.");
    }

    badges.items = [badges.items[0]!];

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={initialDocument}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑标签 Next.js" }));
    const deleteButton = within(getInspectorPanel()).getByRole("button", {
      name: "删除标签",
    });

    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);

    expect(
      screen.queryByRole("button", { name: "编辑标签 Next.js" }),
    ).not.toBeInTheDocument();
  });

  it("reflects the selected text block formatting in the toolbar", async () => {
    const initialDocument = createDefaultResumeDocument();
    initialDocument.sections[0].blocks[0] = {
      ...initialDocument.sections[0].blocks[0],
      type: "text",
      content: richText("共享渲染器基础", [
        { type: "bold" },
        { type: "italic" },
        { type: "underline" },
        { type: "strike" },
        { type: "tag" },
        { type: "link", attrs: { href: "https://example.com" } },
      ]),
    };

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={initialDocument}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    expect(screen.getByRole("button", { name: spacedLabel("加粗") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: spacedLabel("斜体") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: spacedLabel("下划线") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: spacedLabel("删除线") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: spacedLabel("内联标签") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "链接" })).toHaveValue(
      "https://example.com",
    );
  });

  it("switches the canvas into layout sort mode and reveals drag handles", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "文本样式" }),
    ).toBeInTheDocument();
    openRibbonTab("开始");

    fireEvent.click(screen.getByRole("button", { name: spacedLabel("布局排序") }));

    expect(screen.getByRole("button", { name: spacedLabel("内容编辑") })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: spacedLabel("布局排序") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("textbox", { name: "文本块编辑器" })).not.toBeInTheDocument();
    expect(
      within(getInspectorPanel()).queryByRole("button", { name: spacedLabel("加粗") }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: /拖动/,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("updates toolbar pressed state after applying formatting", async () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    const boldButton = screen.getByRole("button", { name: spacedLabel("加粗") });

    expect(boldButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(boldButton);

    expect(screen.getByRole("button", { name: spacedLabel("加粗") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("restores a newer local draft from the recovery prompt", async () => {
    const recoveryDocument = createDefaultResumeDocument();
    recoveryDocument.meta.title = "Recovered Local Draft";

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
        initialVersion={3}
        initialUpdatedAt={100}
        autosaveDelayMs={800}
        draftRepository={{
          getDraft: async () => ({
            resumeId: "resume-demo",
            document: recoveryDocument,
            baseVersion: 3,
            updatedAt: 900,
          }),
          saveDraft: async () => undefined,
          deleteDraft: async () => undefined,
        }}
        saveDocument={async ({ version }) => ({
          version: version + 1,
          updatedAt: 1000,
        })}
      />,
    );

    await waitFor(() => {
      expect(feedbackMocks.notificationWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: false,
          key: "editor-version-recovery",
          title: "发现较新的本地草稿",
        }),
      );
    });
    const recoveryNotification = feedbackMocks.notificationWarning.mock.calls.at(-1)?.[0];
    const actions = render(recoveryNotification.actions);
    fireEvent.click(
      within(actions.container).getByRole("button", { name: /查看差异/ }),
    );

    const dialog = (await screen.findByText("版本差异")).closest(
      "[role='dialog']",
    ) as HTMLElement;
    expect(within(dialog).getAllByText("Recovered Local Draft").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("云端版本").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("本地版本").length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole("button", { name: spacedLabel("关闭") }));

    fireEvent.click(
      within(actions.container).getByRole("button", {
        name: spacedLabel("恢复本地版本"),
      }),
    );

    expect(screen.getByRole("textbox", { name: "简历标题" })).toHaveValue(
      "Recovered Local Draft",
    );
    expect(screen.getByText("有未保存更改")).toBeInTheDocument();
  });

  it("adds a new section from the Insert ribbon and selects it", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));

    expect(screen.getByRole("button", { name: "新区块" })).toBeInTheDocument();
    expect(screen.getByText("从这里开始编写")).toBeInTheDocument();
  });

  it("adds a projects preset section from the Insert ribbon", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增项目区块") }));

    expect(screen.getByRole("button", { name: "项目" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "用一小段文字说明项目范围、技术栈与可量化结果。",
      }),
    ).toBeInTheDocument();
  });

  it("hides the selected section from the canvas while keeping it inspectable", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "个人简介" }));
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "区块布局" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("隐藏区块") }));

    expect(screen.getAllByText("已隐藏")).toHaveLength(1);
    expect(screen.queryByText("共享渲染器基础")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: spacedLabel("显示区块") })).toBeInTheDocument();
  });

  it("deletes the selected section and shifts focus to the next remaining section", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "个人简介" }));
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "区块布局" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("删除区块") }));

    expect(screen.queryByRole("button", { name: "个人简介" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "经历" })).toBeInTheDocument();
    expect(screen.getByText("AnonResume - 前端工程师")).toBeInTheDocument();
  });

  it("undoes and redoes section changes from the toolbar", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("新增区块") }));

    expect(screen.getByRole("button", { name: exactSpacedLabel("撤销") })).toBeEnabled();
    expect(screen.getByRole("button", { name: exactSpacedLabel("重做") })).toBeDisabled();
    expect(screen.getByRole("button", { name: "新区块" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: exactSpacedLabel("撤销") }));

    expect(screen.queryByRole("button", { name: "新区块" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: exactSpacedLabel("重做") })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: exactSpacedLabel("重做") }));

    expect(screen.getByRole("button", { name: "新区块" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: exactSpacedLabel("撤销") })).toBeEnabled();
  });

  it("reorders sections from outline controls and keeps outline and canvas in sync", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "上移 经历" }));

    const canvas = screen.getByRole("article");
    const headings = within(canvas).getAllByText(/个人简介|经历/);

    expect(screen.getByRole("button", { name: "经历" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "个人简介" })).toBeInTheDocument();
    expect(headings[0]).toHaveTextContent("经历");
    expect(headings[1]).toHaveTextContent("个人简介");
  });

  it("moves a selected text block upward within its parent group", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "围绕结构化编辑器架构、共享渲染契约与 A4 优先展示能力展开实现。",
      }),
    );
    expect(
      within(getInspectorPanel()).getByRole("group", { name: "文本样式" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "上移 Block" }));

    const movedBlock = screen.getByRole("textbox", {
      name: "文本块编辑器",
    });
    const roleBlock = screen.getByRole("button", {
      name: "AnonResume - 前端工程师",
    });

    expect(movedBlock).toHaveTextContent(
      "围绕结构化编辑器架构、共享渲染契约与 A4 优先展示能力展开实现。",
    );
    expect(movedBlock.compareDocumentPosition(roleBlock)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
