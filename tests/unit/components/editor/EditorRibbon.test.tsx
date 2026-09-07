import { fireEvent, render, screen, within } from "@testing-library/react";

import {
  EditorRibbon,
  EditorRibbonPropertyGroup,
  type EditorRibbonTab,
} from "@/components/editor/EditorRibbon";

const tabs = [
  { key: "home" as const, label: "开始" },
  { key: "insert" as const, label: "插入" },
  { key: "layout" as const, label: "布局" },
  { key: "document" as const, label: "文档" },
  { key: "properties" as const, label: "属性" },
];

describe("EditorRibbon", () => {
  it("renders document identity and an accessible active command surface", () => {
    render(
      <EditorRibbon
        activeTab="home"
        backHref="/app"
        backLabel="返回工作台"
        commandGroups={[
          { key: "mode", label: "编辑模式", content: <button>内容编辑</button> },
          { key: "text", label: "文本", content: <button disabled>加粗</button> },
        ]}
        documentActions={<button>PDF</button>}
        documentName="前端工程师"
        documentNameLabel="简历标题"
        quickActions={<button>撤销</button>}
        saveStatus="已保存"
        saveStatusTone="success"
        tabs={tabs}
        tablistLabel="编辑器功能区"
        onDocumentNameChange={() => undefined}
        onTabChange={() => undefined}
      />,
    );

    expect(screen.getByRole("link", { name: "返回工作台" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(screen.getByRole("textbox", { name: "简历标题" })).toHaveValue(
      "前端工程师",
    );
    expect(screen.getByTestId("resume-save-status")).toHaveTextContent("已保存");
    expect(screen.getByTestId("resume-save-status")).toHaveAttribute(
      "data-status-tone",
      "success",
    );
    expect(screen.getByRole("tablist", { name: "编辑器功能区" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "开始" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const commandPanel = screen.getByRole("tabpanel", { name: "开始" });
    expect(commandPanel).toHaveTextContent("编辑模式");
    expect(commandPanel).toHaveTextContent("内容编辑");
    expect(commandPanel).toHaveTextContent("文本");
    expect(commandPanel).toHaveTextContent("加粗");
    expect(screen.getByRole("button", { name: "加粗" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "撤销" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
  });

  it("reports tab changes without mutating its own active state", () => {
    const onTabChange = vi.fn<(tab: EditorRibbonTab) => void>();

    render(
      <EditorRibbon
        activeTab="home"
        backHref="/app"
        backLabel="返回工作台"
        commandGroups={[]}
        documentActions={null}
        documentName="简历"
        documentNameLabel="简历标题"
        quickActions={null}
        saveStatus="空闲"
        tabs={tabs}
        tablistLabel="编辑器功能区"
        onDocumentNameChange={() => undefined}
        onTabChange={onTabChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "插入" }));

    expect(onTabChange).toHaveBeenCalledWith("insert");
    expect(screen.getByRole("tab", { name: "开始" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps contextual controls in the same compact command band as every other tab", () => {
    render(
      <EditorRibbon
        activeTab="properties"
        backHref="/app"
        backLabel="返回工作台"
        commandGroups={[]}
        documentActions={null}
        documentName="简历"
        documentNameLabel="简历标题"
        contextualContent={(
          <EditorRibbonPropertyGroup label="基础信息">
            <input aria-label="简历标题" />
          </EditorRibbonPropertyGroup>
        )}
        quickActions={null}
        saveStatus="空闲"
        tabs={tabs}
        tablistLabel="编辑器功能区"
        onDocumentNameChange={() => undefined}
        onTabChange={() => undefined}
      />,
    );

    const propertyPanel = screen.getByRole("tabpanel", { name: "属性" });

    expect(window.getComputedStyle(propertyPanel.parentElement!)).toHaveProperty(
      "height",
      "58px",
    );
    expect(
      window.getComputedStyle(screen.getByRole("group", { name: "基础信息" })),
    ).toHaveProperty("height", "49px");
    expect(within(propertyPanel).getByLabelText("简历标题")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "属性" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("supports standard arrow-key navigation between ribbon tabs", () => {
    const onTabChange = vi.fn<(tab: EditorRibbonTab) => void>();

    render(
      <EditorRibbon
        activeTab="home"
        backHref="/app"
        backLabel="返回工作台"
        commandGroups={[]}
        documentActions={null}
        documentName="简历"
        documentNameLabel="简历标题"
        quickActions={null}
        saveStatus="空闲"
        tabs={tabs}
        tablistLabel="编辑器功能区"
        onDocumentNameChange={() => undefined}
        onTabChange={onTabChange}
      />,
    );

    const homeTab = screen.getByRole("tab", { name: "开始" });
    const insertTab = screen.getByRole("tab", { name: "插入" });

    homeTab.focus();
    fireEvent.keyDown(homeTab, { key: "ArrowRight" });

    expect(onTabChange).toHaveBeenCalledWith("insert");
    expect(insertTab).toHaveFocus();
  });

  it("uses one compact shape for every ribbon button", () => {
    render(
      <EditorRibbon
        activeTab="home"
        backHref="/app"
        backLabel="返回工作台"
        commandGroups={[
          { key: "mode", label: "编辑模式", content: <button>内容编辑</button> },
        ]}
        documentActions={<button>PDF</button>}
        documentName="简历"
        documentNameLabel="简历标题"
        quickActions={<button>撤销</button>}
        saveStatus="空闲"
        tabs={tabs}
        tablistLabel="编辑器功能区"
        onDocumentNameChange={() => undefined}
        onTabChange={() => undefined}
      />,
    );

    const ribbon = screen.getByTestId("editor-ribbon");

    const controls = ribbon.querySelectorAll<HTMLElement>("button, a.ant-btn");

    for (const control of controls) {
      const style = window.getComputedStyle(control);

      expect(style.height).toBe("28px");
      expect(style.borderRadius).toBe("6px");
    }

    const titleInput = screen.getByRole("textbox", { name: "简历标题" });
    const titleStyle = window.getComputedStyle(titleInput);

    expect(titleStyle.height).toBe("28px");
    expect(titleStyle.borderRadius).toBe("6px");
  });
});
