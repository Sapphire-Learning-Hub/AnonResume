import { render, screen, waitFor, within } from "@testing-library/react";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  createResumeDiffPresentation,
  createResumeDiffTextSegments,
  type ResumeRendererDiffPresentation,
} from "@/components/resume/resume-diff-presentation";
import type { ResumeDocumentDiffResult } from "@/domain/resume/document-diff";

import { ResumeRenderer } from "@/components/resume/ResumeRenderer";

function createRect(height: number, width = 794) {
  return {
    width,
    height,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  };
}

describe("ResumeRenderer", () => {
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: originalGetBoundingClientRect,
    });
    delete (window as Window & { __ANON_RESUME_PRINT_READY__?: boolean })
      .__ANON_RESUME_PRINT_READY__;
    document.documentElement.removeAttribute("data-print-ready");
  });

  it("renders section titles and list content from a resume document", () => {
    render(
      <ResumeRenderer document={createDefaultResumeDocument()} mode="view" />,
    );

    expect(screen.getByText("个人简介")).toBeInTheDocument();
    expect(
      screen.getByText("基于流式布局的结构化简历编辑基础能力"),
    ).toBeInTheDocument();
    expect(getComputedStyle(screen.getByText("第 1 页")).color).toBe(
      "rgba(255, 255, 255, 0.92)",
    );
  });

  it("annotates semantic resume nodes only when a diff presentation is supplied", () => {
    const document = createDefaultResumeDocument();
    const summaryBlock = document.sections[0]?.blocks[0];

    if (!summaryBlock || summaryBlock.type !== "text") {
      throw new Error("default summary block missing");
    }

    summaryBlock.content.content[0]!.content = [
      { type: "text", text: "基于流式布局的结构化简历编辑基础能力" },
    ];
    const result: ResumeDocumentDiffResult = {
      changes: [
        {
          id: "content:moved:section-profile:order",
          category: "content",
          kind: "moved",
          nodeId: "section-profile",
          nodeType: "section",
          label: "个人简介",
          field: "order",
          cloudValue: "1",
          localValue: "2",
        },
        {
          id: "content:changed:block-profile-summary:text",
          category: "content",
          kind: "changed",
          nodeId: "block-profile-summary",
          nodeType: "block",
          label: "简介",
          field: "text",
          cloudValue: "基于流式布局的结构化简历编辑基础能力",
          localValue: "面向流式布局的结构化简历编辑基础能力",
        },
        {
          id: "content:removed:badge-bun:node",
          category: "content",
          kind: "removed",
          nodeId: "badge-bun",
          nodeType: "badge",
          label: "Bun",
          field: "node",
          cloudValue: "Bun",
        },
      ],
      summary: {
        total: 3,
        content: 3,
        appearance: 0,
        added: 0,
        removed: 1,
        changed: 1,
        moved: 1,
      },
    };
    const presentation = createResumeDiffPresentation(result);

    const { container } = render(
      <ResumeRenderer
        document={document}
        mode="view"
        diffPresentation={{
          side: "source",
          annotations: presentation.sourceAnnotations,
          pageSettings: presentation.pageSettings,
        }}
      />,
    );

    expect(screen.getByTestId("resume-section-section-profile")).toHaveAttribute(
      "data-resume-diff-kind",
      "moved",
    );
    expect(
      screen.getByTestId("resume-block-item-block-profile-summary"),
    ).toHaveAttribute("data-resume-diff-kind", "changed");
    expect(screen.getByText("Bun").closest("[data-resume-diff-kind]"))
      .toHaveAttribute("data-resume-diff-kind", "removed");
    expect(screen.getByText("基于").tagName).toBe("DEL");
    expect(
      container.querySelectorAll("[data-resume-diff-marker='true']"),
    ).toHaveLength(3);
  });

  it("renders target text additions with semantic ins elements", () => {
    const document = createDefaultResumeDocument();
    const summaryBlock = document.sections[0]?.blocks[0];

    if (!summaryBlock || summaryBlock.type !== "text") {
      throw new Error("default summary block missing");
    }

    summaryBlock.content.content[0]!.content = [
      { type: "text", text: "面向流式布局的结构化简历编辑基础能力" },
    ];
    const targetKey = "block:block-profile-summary:text";
    const textSegments = createResumeDiffTextSegments(
      "基于流式布局的结构化简历编辑基础能力",
      "面向流式布局的结构化简历编辑基础能力",
    ).target;
    const diffPresentation: ResumeRendererDiffPresentation = {
      side: "target",
      annotations: new Map([
        [
          targetKey,
          [
            {
              changeId: "content:changed:block-profile-summary:text",
              targetKey,
              nodeId: "block-profile-summary",
              nodeType: "block",
              field: "text",
              kind: "changed",
              side: "target",
              markerLabel: "changed",
              textSegments,
            },
          ],
        ],
      ]),
      pageSettings: [],
    };

    render(
      <ResumeRenderer
        document={document}
        mode="view"
        diffPresentation={diffPresentation}
      />,
    );

    expect(screen.getByText("面向").tagName).toBe("INS");
  });

  it("never renders diff annotations in print mode", () => {
    const targetKey = "section:section-profile:order";
    const diffPresentation: ResumeRendererDiffPresentation = {
      side: "source",
      annotations: new Map([
        [
          targetKey,
          [
            {
              changeId: "content:moved:section-profile:order",
              targetKey,
              nodeId: "section-profile",
              nodeType: "section",
              field: "order",
              kind: "moved",
              side: "source",
              markerLabel: "moved",
              valueLabel: "1",
            },
          ],
        ],
      ]),
      pageSettings: [],
    };

    const { container } = render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="print"
        diffPresentation={diffPresentation}
      />,
    );

    expect(container.querySelector("[data-resume-diff-kind]")).toBeNull();
    expect(container.querySelector("[data-resume-diff-marker]")).toBeNull();
  });

  it("marks responsive view output for mobile reading styles", () => {
    const { container } = render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="view"
        responsiveView
      />,
    );

    expect(container.querySelector("[data-resume-responsive-view='true']")).toBeInTheDocument();
  });

  it("reports the current paginated page count", async () => {
    const onPageCountChange = vi.fn();

    render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        onPageCountChange={onPageCountChange}
      />,
    );

    await waitFor(() => {
      expect(onPageCountChange).toHaveBeenLastCalledWith(1);
    });
  });

  it("recalculates pagination when the editor requests a fresh measurement", async () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => createRect(40),
    });
    const onPaginationReadyChange = vi.fn();
    const { rerender } = render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        paginationRevision={0}
        onPaginationReadyChange={onPaginationReadyChange}
      />,
    );

    await waitFor(() => {
      expect(onPaginationReadyChange).toHaveBeenLastCalledWith(true);
    });

    rerender(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        paginationRevision={1}
        onPaginationReadyChange={onPaginationReadyChange}
      />,
    );

    expect(onPaginationReadyChange).toHaveBeenLastCalledWith(false);

    await waitFor(() => {
      expect(onPaginationReadyChange).toHaveBeenLastCalledWith(true);
    });
  });

  it("finishes pagination when a structural row is empty", async () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const blockPath = this.getAttribute?.("data-resume-block-path");

        return createRect(
          blockPath ===
            "group-experience-anonresume::row-experience-header"
            ? 0
            : 40,
        );
      },
    });
    const document = createDefaultResumeDocument();
    const experienceGroup = document.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "group");
    const headerRow = experienceGroup?.children.find(
      (block) => block.type === "row",
    );

    if (!headerRow || headerRow.type !== "row") {
      throw new Error("Expected the default document to contain a header row");
    }

    headerRow.children = [];
    const onPaginationReadyChange = vi.fn();

    render(
      <ResumeRenderer
        document={document}
        mode="edit"
        onPaginationReadyChange={onPaginationReadyChange}
      />,
    );

    await waitFor(() => {
      expect(onPaginationReadyChange).toHaveBeenLastCalledWith(true);
    });
  });

  it("renders the print safe-area overlay only for the editor canvas", () => {
    const { container, rerender } = render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        showPrintSafeArea
      />,
    );

    expect(
      container.querySelector("[data-resume-print-safe-area='true']"),
    ).toHaveAttribute("aria-hidden", "true");

    rerender(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="view"
        showPrintSafeArea
      />,
    );

    expect(
      container.querySelector("[data-resume-print-safe-area='true']"),
    ).not.toBeInTheDocument();
  });

  it("renders nested group and row blocks from the default document", () => {
    render(
      <ResumeRenderer document={createDefaultResumeDocument()} mode="view" />,
    );

    expect(screen.getByText("经历")).toBeInTheDocument();
    expect(
      screen.getByText("AnonResume - 前端工程师"),
    ).toBeInTheDocument();
    expect(screen.getByText("2026.01 - 2026.08")).toBeInTheDocument();
    expect(
      screen.getByText("构建共享 Web 与打印渲染链路的结构化简历编辑器。"),
    ).toBeInTheDocument();
  });

  it("renders custom application links while keeping executable URLs inert", () => {
    const document = createDefaultResumeDocument();
    const profileTitle = document.sections[0]?.title;

    if (!profileTitle) {
      throw new Error("Expected the profile section to have a title");
    }

    profileTitle.content[0]!.content = [
      {
        type: "text",
        text: "打开应用",
        marks: [
          {
            type: "link",
            attrs: { href: "my-resume-app://profile/42" },
          },
        ],
      },
      {
        type: "text",
        text: "不执行脚本",
        marks: [
          {
            type: "link",
            attrs: { href: "javascript:alert(1)" },
          },
        ],
      },
    ];

    render(<ResumeRenderer document={document} mode="view" />);

    expect(screen.getByRole("link", { name: "打开应用" })).toHaveAttribute(
      "href",
      "my-resume-app://profile/42",
    );
    expect(screen.queryByRole("link", { name: "不执行脚本" })).not.toBeInTheDocument();
  });

  it("renders underline and strike rich-text marks in public output", () => {
    const document = createDefaultResumeDocument();
    const profileTitle = document.sections[0]?.title;

    if (!profileTitle) {
      throw new Error("Expected the profile section to have a title");
    }

    profileTitle.content[0]!.content = [
      {
        type: "text",
        text: "带下划线和删除线的文本",
        marks: [{ type: "underline" }, { type: "strike" }],
      },
    ];

    render(<ResumeRenderer document={document} mode="view" />);

    expect(screen.getByText("带下划线和删除线的文本").closest("s")).toBeTruthy();
    expect(screen.getByText("带下划线和删除线的文本").closest("u")).toBeTruthy();
  });

  it.each(["view", "print"] as const)(
    "renders local inline icons in %s mode",
    (mode) => {
      const document = createDefaultResumeDocument();
      const profileTitle = document.sections[0]?.title;

      if (!profileTitle) {
        throw new Error("Expected the profile section to have a title");
      }

      profileTitle.content[0]!.content = [
        {
          type: "resumeIcon",
          attrs: { iconId: "lucide:mail" },
        },
        { type: "text", text: " hello@example.com" },
      ];

      const { container } = render(
        <ResumeRenderer document={document} mode={mode} />,
      );
      const icon = container.querySelector(
        '[data-resume-icon-id="lucide:mail"]',
      );

      expect(icon).toBeInTheDocument();
      expect(icon?.querySelector("svg")).toBeInTheDocument();
      expect(icon).toHaveAttribute("aria-hidden", "true");
    },
  );

  it("keeps rendering when an icon id is no longer in the catalog", () => {
    const document = createDefaultResumeDocument();
    const profileTitle = document.sections[0]?.title;

    if (!profileTitle) {
      throw new Error("Expected the profile section to have a title");
    }

    profileTitle.content[0]!.content = [
      {
        type: "resumeIcon",
        attrs: { iconId: "removed:icon" },
      },
      { type: "text", text: " still visible" },
    ];

    const { container } = render(
      <ResumeRenderer document={document} mode="view" />,
    );

    expect(screen.getByText("still visible", { exact: false })).toBeInTheDocument();
    expect(
      container.querySelector('[data-resume-icon-missing="true"]'),
    ).toBeInTheDocument();
  });

  it("applies section layout direction and gap to the rendered block stack", () => {
    const document = createDefaultResumeDocument();
    document.sections[0] = {
      ...document.sections[0],
      layout: {
        ...document.sections[0].layout,
        direction: "horizontal",
        gap: 28,
      },
    };

    const { container } = render(
      <ResumeRenderer document={document} mode="view" />,
    );
    const blockStack = container.querySelector(
      '[data-resume-block-stack="section-profile"]',
    );

    expect(blockStack).toHaveStyle({
      flexDirection: "row",
      gap: "28px",
    });
  });

  it("applies section column layout to the rendered block stack", () => {
    const document = createDefaultResumeDocument();
    document.sections[0] = {
      ...document.sections[0],
      layout: {
        ...document.sections[0].layout,
        columns: 2,
      },
    };

    const { container } = render(
      <ResumeRenderer document={document} mode="view" />,
    );
    const blockStack = container.querySelector(
      '[data-resume-block-stack="section-profile"]',
    );

    expect(blockStack).toHaveStyle({
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    });
  });

  it("applies section padding to the rendered section container", () => {
    const document = createDefaultResumeDocument();
    document.sections[0] = {
      ...document.sections[0],
      layout: {
        ...document.sections[0].layout,
        padding: {
          top: 12,
          right: 16,
          bottom: 20,
          left: 24,
        },
      },
    };

    const { container } = render(
      <ResumeRenderer document={document} mode="view" />,
    );
    const section = container.querySelector(
      '[data-resume-section-id="section-profile"]',
    );

    expect(section).toHaveStyle({
      paddingTop: "12px",
      paddingRight: "16px",
      paddingBottom: "20px",
      paddingLeft: "24px",
    });
  });

  it("applies the document font family to the rendered page", () => {
    const document = createDefaultResumeDocument();

    document.settings.typography.fontFamily =
      '"Source Han Sans SC", "Noto Sans SC", sans-serif';

    const { container } = render(
      <ResumeRenderer document={document} mode="view" />,
    );
    const page = container.querySelector("[data-resume-page='true']");

    expect(page).toHaveStyle({
      "--resume-font-family": "var(--font-noto-sans-sc), sans-serif",
      fontFamily: "var(--font-noto-sans-sc), sans-serif",
    });
  });

  it("keeps badge chips at a fixed height when the document line height increases", () => {
    const document = createDefaultResumeDocument();

    document.settings.typography.lineHeight = 2.2;

    render(<ResumeRenderer document={document} mode="view" />);

    expect(screen.getByText("Next.js")).toHaveStyle({
      display: "inline-flex",
      alignItems: "center",
      lineHeight: "1",
    });
  });

  it("uses a tighter dedicated spacing below section titles", () => {
    const { container } = render(
      <ResumeRenderer document={createDefaultResumeDocument()} mode="view" />,
    );
    const titleContainer = container.querySelector(
      '[data-resume-section-title="true"]',
    );
    const titleParagraph = container.querySelector(
      '[data-resume-section-title="true"] p',
    );

    expect(titleContainer).not.toBeNull();
    expect(titleParagraph).not.toBeNull();
    expect(getComputedStyle(titleContainer!).marginBottom).toBe("12px");
    expect(getComputedStyle(titleParagraph!).marginTop).toBe("0px");
    expect(getComputedStyle(titleParagraph!).marginBottom).toBe("0px");
  });

  it("keeps editable canvas typography aligned with view mode", () => {
    const document = createDefaultResumeDocument();
    const editRender = render(
      <ResumeRenderer document={document} mode="edit" onMoveBlock={vi.fn()} />,
    );
    const viewRender = render(
      <ResumeRenderer document={document} mode="view" />,
    );

    const editTitleButton = within(editRender.container).getByLabelText(
      "编辑区块标题 个人简介",
    );
    const viewTitle = viewRender.container.querySelector(
      '[data-resume-section-title="true"]',
    );
    const editSummaryButton = within(editRender.container).getByLabelText(
      "共享渲染器基础",
    );
    const viewSummary = within(viewRender.container)
      .getByText("共享渲染器基础")
      .closest("div");
    const editRangeButton = within(editRender.container).getByLabelText(
      "2026.01 - 2026.08",
    );
    const viewRange = within(viewRender.container)
      .getByText("2026.01 - 2026.08")
      .closest("div");

    expect(viewTitle).not.toBeNull();
    expect(viewSummary).not.toBeNull();
    expect(viewRange).not.toBeNull();

    const editTitleStyles = getComputedStyle(editTitleButton);
    const viewTitleStyles = getComputedStyle(viewTitle!);
    const editSummaryStyles = getComputedStyle(editSummaryButton);
    const viewSummaryStyles = getComputedStyle(viewSummary!);
    const editRangeStyles = getComputedStyle(editRangeButton);
    const viewRangeStyles = getComputedStyle(viewRange!);

    expect(editTitleStyles.color).toBe(viewTitleStyles.color);
    expect(editTitleStyles.fontFamily).toBe(viewTitleStyles.fontFamily);
    expect(editTitleStyles.fontSize).toBe(viewTitleStyles.fontSize);
    expect(editTitleStyles.fontWeight).toBe(viewTitleStyles.fontWeight);
    expect(editTitleStyles.lineHeight).toBe(viewTitleStyles.lineHeight);

    expect(editSummaryStyles.color).toBe(viewSummaryStyles.color);
    expect(editSummaryStyles.fontFamily).toBe(viewSummaryStyles.fontFamily);
    expect(editSummaryStyles.fontSize).toBe(viewSummaryStyles.fontSize);
    expect(editSummaryStyles.fontWeight).toBe(viewSummaryStyles.fontWeight);
    expect(editSummaryStyles.lineHeight).toBe(viewSummaryStyles.lineHeight);

    expect(editRangeStyles.color).toBe(viewRangeStyles.color);
    expect(editRangeStyles.fontFamily).toBe(viewRangeStyles.fontFamily);
    expect(editRangeStyles.fontSize).toBe(viewRangeStyles.fontSize);
    expect(editRangeStyles.fontWeight).toBe(viewRangeStyles.fontWeight);
    expect(editRangeStyles.lineHeight).toBe(viewRangeStyles.lineHeight);
  });

  it("renders supported rich text marks and hard breaks", () => {
    const document = createDefaultResumeDocument();
    document.sections[0]!.blocks[0] = {
      id: "block-rich-text",
      type: "text",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Bold",
                marks: [{ type: "bold" }],
              },
              { type: "hardBreak" },
              {
                type: "text",
                text: "Link",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://example.com" },
                  },
                ],
              },
              {
                type: "text",
                text: " Code",
                marks: [{ type: "code" }],
              },
            ],
          },
        ],
      },
    };

    const { container } = render(<ResumeRenderer document={document} mode="view" />);

    expect(screen.getByText("Bold").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Link" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === "CODE" && element.textContent === " Code",
      ).tagName,
    ).toBe("CODE");
    expect(container.querySelector("br")).not.toBeNull();
  });

  it("renders inline tags in the same paragraph as adjacent text", () => {
    const document = createDefaultResumeDocument();
    document.sections[0]!.blocks[0] = {
      id: "block-inline-tags",
      type: "text",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "项目",
                marks: [{ type: "bold" }, { type: "tag" }],
              },
              { type: "text", text: " LumiCMS" },
            ],
          },
        ],
      },
    };

    const { container } = render(<ResumeRenderer document={document} mode="view" />);
    const tag = container.querySelector('[data-resume-inline-tag="true"]');

    expect(tag).toHaveTextContent("项目");
    expect(tag?.closest("p")).toHaveTextContent("项目 LumiCMS");
    expect(tag?.querySelector("strong")).toHaveTextContent("项目");
  });

  it("keeps content editing as the default edit surface without drag handles", () => {
    render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        onMoveBlock={vi.fn()}
      />,
    );

    expect(
      screen.queryAllByRole("button", {
        name: /拖动/,
      }),
    ).toHaveLength(0);

    expect(
      screen.getByTestId(
        "resume-block-item-group-experience-anonresume-row-experience-header",
      ),
    ).toHaveAttribute("data-resume-drag-mode", "none");
  });

  it("shows drag handles only in layout sort mode", () => {
    render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        onMoveBlock={vi.fn()}
        editSurfaceMode="layout"
      />,
    );

    expect(
      screen.getAllByRole("button", {
        name: /拖动/,
      }).length,
    ).toBeGreaterThan(0);
    const blockItem = screen.getByTestId(
      "resume-block-item-group-experience-anonresume-row-experience-header",
    );
    const sortChrome = screen.getByTestId(
      "resume-sort-chrome-group-experience-anonresume-row-experience-header",
    );
    const dragHandle = screen.getByRole("button", {
      name: "拖动 行 Block",
    });

    expect(blockItem).toHaveAttribute("data-resume-drag-mode", "handle");
    expect(blockItem).toHaveAttribute(
      "data-resume-edit-surface-mode",
      "layout",
    );
    expect(blockItem).toHaveAttribute("data-resume-dragging", "false");
    expect(blockItem).toHaveAttribute("data-resume-over", "false");
    expect(sortChrome).toHaveAttribute(
      "data-resume-handle-placement",
      "floating",
    );
    expect(sortChrome).toHaveAttribute("data-resume-dragging", "false");
    expect(sortChrome).toHaveAttribute("data-resume-over", "false");
    expect(dragHandle).toHaveAttribute(
      "data-resume-handle-placement",
      "floating",
    );
  });

  it("shows nested drag handles for row children in layout sort mode", () => {
    render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        onMoveBlock={vi.fn()}
        editSurfaceMode="layout"
      />,
    );

    expect(
      screen.getByTestId(
        "resume-block-item-group-experience-anonresume-row-experience-header",
      ),
    ).toHaveAttribute("data-resume-drag-mode", "handle");
    expect(
      screen.getByTestId(
        "resume-block-item-group-experience-anonresume-row-experience-header-text-experience-role",
      ),
    ).toHaveAttribute("data-resume-drag-mode", "handle");
    expect(
      screen.getByTestId(
        "resume-block-item-group-experience-anonresume-row-experience-header-text-experience-range",
      ),
    ).toHaveAttribute("data-resume-drag-mode", "handle");
    expect(
      screen.getByRole("button", {
        name: "拖动 AnonResume - 前端工程师",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "拖动 2026.01 - 2026.08",
      }),
    ).toBeInTheDocument();
  });

  it("renders sort chrome as absolute overlays so layout chrome does not affect block flow", () => {
    render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        onMoveBlock={vi.fn()}
        editSurfaceMode="layout"
      />,
    );

    expect(
      screen.getByTestId("resume-sort-chrome-group-experience-anonresume-row-experience-header"),
    ).toHaveStyle({
      position: "absolute",
      pointerEvents: "none",
    });
    expect(
      screen.getByTestId(
        "resume-sort-chrome-group-experience-anonresume-row-experience-header-text-experience-role",
      ),
    ).toHaveStyle({
      position: "absolute",
      pointerEvents: "none",
    });
  });

  it("renders a tiptap-backed editor for the selected text block", () => {
    render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        onMoveBlock={vi.fn()}
        selection={{
          sectionId: "section-profile",
          blockPath: ["block-profile-summary"],
          richTextField: "content",
        }}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "文本块编辑器" });

    expect(editor.tagName).toBe("DIV");
    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(editor).toHaveTextContent("共享渲染器基础");
    expect(editor.parentElement).not.toBeNull();
    expect(
      screen.getByTestId("selected-editor-shell-section-profile-block-profile-summary"),
    ).toHaveStyle({
      position: "relative",
    });
    expect(
      screen.getByTestId("selected-editor-placeholder-section-profile-block-profile-summary"),
    ).toHaveStyle({
      visibility: "hidden",
    });
    expect(editor.parentElement!).toHaveStyle({
      position: "absolute",
      inset: "0px",
    });
    expect(screen.queryAllByRole("button", { name: /拖动/ })).toHaveLength(0);
  });

  it("renders a tiptap-backed editor for a selected nested list item text block", () => {
    render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        onMoveBlock={vi.fn()}
        selection={{
          sectionId: "section-profile",
          blockPath: [
            "block-profile-highlights",
            "item-foundation-1",
            "item-foundation-1-text",
          ],
          richTextField: "content",
        }}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "文本块编辑器" });

    expect(editor).toHaveTextContent("基于流式布局的结构化简历编辑基础能力");
    expect(
      screen.getByTestId(
        "selected-editor-shell-section-profile-item-foundation-1-text",
      ),
    ).toHaveStyle({
      position: "relative",
    });
  });

  it("renders a tiptap-backed editor for the selected section title", () => {
    render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        selection={{
          sectionId: "section-profile",
          richTextField: "title",
        }}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "文本块编辑器" });

    expect(editor.tagName).toBe("DIV");
    expect(editor).toHaveAttribute("contenteditable", "true");
    expect(editor).toHaveTextContent("个人简介");
    expect(screen.getByTestId("selected-editor-shell-section-profile-title")).toHaveStyle({
      position: "relative",
    });
    expect(
      screen.getByTestId("selected-editor-placeholder-section-profile-title"),
    ).toHaveStyle({
      visibility: "hidden",
    });
  });

  it("splits overflowing sections into multiple A4 pages", async () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const sectionId = this.getAttribute?.("data-resume-section-id");
        const blockPath = this.getAttribute?.("data-resume-block-path");
        const listItemPath = this.getAttribute?.("data-resume-list-item-path");
        const isSectionTitle = this.hasAttribute?.("data-resume-section-title");

        if (sectionId === "section-profile") {
          return {
            width: 794,
            height: 700,
            top: 0,
            right: 794,
            bottom: 700,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (sectionId === "section-experience") {
          return {
            width: 794,
            height: 500,
            top: 0,
            right: 794,
            bottom: 500,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (isSectionTitle) {
          return {
            width: 794,
            height: 80,
            top: 0,
            right: 794,
            bottom: 80,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "block-profile-summary") {
          return {
            width: 794,
            height: 200,
            top: 0,
            right: 794,
            bottom: 200,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "block-profile-highlights") {
          return {
            width: 794,
            height: 200,
            top: 0,
            right: 794,
            bottom: 200,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (
          listItemPath === "block-profile-highlights::item-foundation-1" ||
          listItemPath === "block-profile-highlights::item-foundation-2"
        ) {
          return {
            width: 794,
            height: 92,
            top: 0,
            right: 794,
            bottom: 92,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "block-profile-stack") {
          return {
            width: 794,
            height: 176,
            top: 0,
            right: 794,
            bottom: 176,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume") {
          return {
            width: 794,
            height: 396,
            top: 0,
            right: 794,
            bottom: 396,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume::row-experience-header") {
          return {
            width: 794,
            height: 120,
            top: 0,
            right: 794,
            bottom: 120,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume::text-experience-context") {
          return {
            width: 794,
            height: 100,
            top: 0,
            right: 794,
            bottom: 100,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume::list-experience-highlights") {
          return {
            width: 794,
            height: 156,
            top: 0,
            right: 794,
            bottom: 156,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (
          listItemPath === "group-experience-anonresume::list-experience-highlights::item-experience-1" ||
          listItemPath === "group-experience-anonresume::list-experience-highlights::item-experience-2"
        ) {
          return {
            width: 794,
            height: 70,
            top: 0,
            right: 794,
            bottom: 70,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        return {
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        };
      },
    });

    render(<ResumeRenderer document={createDefaultResumeDocument()} mode="view" />);

    await waitFor(() =>
      expect(screen.getAllByTestId(/resume-page-/)).toHaveLength(2),
    );

    expect(within(screen.getByTestId("resume-page-1")).getByText("个人简介")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("resume-page-2")).getByText("经历"),
    ).toBeInTheDocument();
  });

  it("renders continued section fragments across pages without repeating the section title", async () => {
    const document = createDefaultResumeDocument();
    const experienceSection = document.sections[1]!;

    if (experienceSection.blocks[0]?.type !== "group") {
      throw new Error("Expected the default experience section to start with a group block.");
    }

    const experienceGroup = experienceSection.blocks[0];

    document.sections = [
      {
        ...experienceSection,
        blocks: [
          {
            ...experienceGroup,
            children: [
              experienceGroup.children[0]!,
              experienceGroup.children[1]!,
              {
                id: "list-experience-highlights",
                type: "list",
                ordered: true,
                marker: "disc",
                gap: 8,
                items: [
                  {
                    id: "item-experience-1",
                    children: [
                      {
                        id: "item-experience-1-text",
                        type: "text",
                        content: {
                          type: "doc",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Experience Item 1" }],
                            },
                          ],
                        },
                      },
                    ],
                  },
                  {
                    id: "item-experience-2",
                    children: [
                      {
                        id: "item-experience-2-text",
                        type: "text",
                        content: {
                          type: "doc",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Experience Item 2" }],
                            },
                          ],
                        },
                      },
                    ],
                  },
                  {
                    id: "item-experience-3",
                    children: [
                      {
                        id: "item-experience-3-text",
                        type: "text",
                        content: {
                          type: "doc",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Experience Item 3" }],
                            },
                          ],
                        },
                      },
                    ],
                  },
                  {
                    id: "item-experience-4",
                    children: [
                      {
                        id: "item-experience-4-text",
                        type: "text",
                        content: {
                          type: "doc",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Experience Item 4" }],
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const sectionId = this.getAttribute?.("data-resume-section-id");
        const blockPath = this.getAttribute?.("data-resume-block-path");
        const listItemPath = this.getAttribute?.("data-resume-list-item-path");
        const isSectionTitle = this.hasAttribute?.("data-resume-section-title");

        if (sectionId === "section-experience") {
          return {
            width: 794,
            height: 1340,
            top: 0,
            right: 794,
            bottom: 1340,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (isSectionTitle) {
          return {
            width: 794,
            height: 100,
            top: 0,
            right: 794,
            bottom: 100,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume") {
          return {
            width: 794,
            height: 1220,
            top: 0,
            right: 794,
            bottom: 1220,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume::row-experience-header") {
          return {
            width: 794,
            height: 180,
            top: 0,
            right: 794,
            bottom: 180,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume::text-experience-context") {
          return {
            width: 794,
            height: 180,
            top: 0,
            right: 794,
            bottom: 180,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume::list-experience-highlights") {
          return {
            width: 794,
            height: 832,
            top: 0,
            right: 794,
            bottom: 832,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (
          listItemPath ===
            "group-experience-anonresume::list-experience-highlights::item-experience-1" ||
          listItemPath ===
            "group-experience-anonresume::list-experience-highlights::item-experience-2" ||
          listItemPath ===
            "group-experience-anonresume::list-experience-highlights::item-experience-3" ||
          listItemPath ===
            "group-experience-anonresume::list-experience-highlights::item-experience-4"
        ) {
          return {
            width: 794,
            height: 200,
            top: 0,
            right: 794,
            bottom: 200,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        return {
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        };
      },
    });

    render(<ResumeRenderer document={document} mode="view" />);

    await waitFor(() =>
      expect(screen.getAllByTestId(/resume-page-/)).toHaveLength(2),
    );

    expect(
      within(screen.getByTestId("resume-page-1")).getByText("经历"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("resume-page-1")).getByText("Experience Item 1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("resume-page-1")).getByText("Experience Item 2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("resume-page-1")).queryByText("Experience Item 3"),
    ).toBeNull();
    expect(
      within(screen.getByTestId("resume-page-2")).queryByText("经历"),
    ).toBeNull();
    expect(
      within(screen.getByTestId("resume-page-2")).getByText("Experience Item 3"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("resume-page-2")).getByText("Experience Item 4"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("resume-page-2")).getByRole("list"),
    ).toHaveAttribute("start", "3");
  });

  it("renders a nested list item across pages without repeating its outer marker", async () => {
    const document = createDefaultResumeDocument();
    const nestedItems = Array.from({ length: 4 }, (_, index) => ({
      id: `nested-item-${index + 1}`,
      children: [
        {
          id: `nested-text-${index + 1}`,
          type: "text" as const,
          content: {
            type: "doc" as const,
            content: [
              {
                type: "paragraph" as const,
                content: [
                  {
                    type: "text" as const,
                    text: `Nested item ${index + 1}`,
                  },
                ],
              },
            ],
          },
        },
      ],
    }));

    document.sections = [
      {
        id: "section-nested-list",
        visible: true,
        layout: { direction: "vertical", gap: 12 },
        blocks: [
          {
            id: "block-before-list",
            type: "text",
            content: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Earlier content" }],
                },
              ],
            },
          },
          {
            id: "outer-list",
            type: "list",
            marker: "disc",
            gap: 0,
            items: [
              {
                id: "outer-item",
                children: [
                  {
                    id: "outer-label",
                    type: "text",
                    content: {
                      type: "doc",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Work details" }],
                        },
                      ],
                    },
                  },
                  {
                    id: "nested-list",
                    type: "list",
                    marker: "disc",
                    gap: 8,
                    items: nestedItems,
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const sectionId = this.getAttribute?.("data-resume-section-id");
        const blockPath = this.getAttribute?.("data-resume-block-path");
        const listItemPath = this.getAttribute?.("data-resume-list-item-path");

        if (sectionId === "section-nested-list") {
          return createRect(1312);
        }

        if (blockPath === "block-before-list") {
          return createRect(600);
        }

        if (blockPath === "outer-list") {
          return createRect(700);
        }

        if (listItemPath === "outer-list::outer-item") {
          return createRect(700);
        }

        if (blockPath === "outer-list::outer-item::outer-label") {
          return createRect(80);
        }

        if (blockPath === "outer-list::outer-item::nested-list") {
          return createRect(610);
        }

        if (listItemPath?.startsWith("outer-list::outer-item::nested-list::")) {
          return createRect(140);
        }

        if (blockPath?.startsWith("outer-list::outer-item::nested-list::")) {
          return createRect(140);
        }

        return createRect(0);
      },
    });

    render(<ResumeRenderer document={document} mode="view" />);

    await waitFor(() =>
      expect(screen.getAllByTestId(/resume-page-/)).toHaveLength(2),
    );

    const firstPage = screen.getByTestId("resume-page-1");
    const secondPage = screen.getByTestId("resume-page-2");

    expect(within(firstPage).getByText("Work details")).toBeInTheDocument();
    expect(within(firstPage).getByText("Nested item 1")).toBeInTheDocument();
    expect(within(firstPage).getByText("Nested item 2")).toBeInTheDocument();
    expect(within(firstPage).queryByText("Nested item 3")).toBeNull();
    expect(within(secondPage).queryByText("Work details")).toBeNull();
    expect(within(secondPage).getByText("Nested item 3")).toBeInTheDocument();
    expect(within(secondPage).getByText("Nested item 4")).toBeInTheDocument();
    expect(
      secondPage.querySelector('[data-resume-list-continuation="true"]'),
    ).toBeInTheDocument();
  });

  it("waits for pagination to settle before marking print output ready", async () => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
      },
    });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const sectionId = this.getAttribute?.("data-resume-section-id");

        return {
          width: 794,
          height: sectionId === "section-profile" ? 300 : 280,
          top: 0,
          right: 794,
          bottom: sectionId === "section-profile" ? 300 : 280,
          left: 0,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        };
      },
    });

    render(<ResumeRenderer document={createDefaultResumeDocument()} mode="print" />);

    await waitFor(() =>
      expect(
        (window as Window & { __ANON_RESUME_PRINT_READY__?: boolean })
          .__ANON_RESUME_PRINT_READY__,
      ).toBe(true),
    );
    expect(document.documentElement.getAttribute("data-print-ready")).toBe("true");
  });

  it("recomputes pagination when the document line height changes", async () => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
      },
    });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const pageElement = this.closest?.('[data-resume-page="true"]') as HTMLElement | null;
        const lineHeight = Number(
          pageElement?.style.getPropertyValue("--resume-line-height") || "1.45",
        );
        const expanded = lineHeight >= 1.8;
        const sectionId = this.getAttribute?.("data-resume-section-id");
        const blockPath = this.getAttribute?.("data-resume-block-path");
        const listItemPath = this.getAttribute?.("data-resume-list-item-path");
        const isSectionTitle = this.hasAttribute?.("data-resume-section-title");

        if (sectionId === "section-profile") {
          return createRect(expanded ? 900 : 500);
        }

        if (sectionId === "section-experience") {
          return createRect(200);
        }

        if (isSectionTitle) {
          return createRect(expanded ? 90 : 60);
        }

        if (blockPath === "block-profile-summary") {
          return createRect(expanded ? 220 : 140);
        }

        if (blockPath === "block-profile-highlights") {
          return createRect(expanded ? 360 : 200);
        }

        if (blockPath === "block-profile-stack") {
          return createRect(expanded ? 120 : 80);
        }

        if (blockPath === "group-experience-anonresume") {
          return createRect(140);
        }

        if (blockPath === "group-experience-anonresume::row-experience-header") {
          return createRect(48);
        }

        if (blockPath === "group-experience-anonresume::text-experience-context") {
          return createRect(40);
        }

        if (blockPath === "group-experience-anonresume::list-experience-highlights") {
          return createRect(40);
        }

        if (
          listItemPath === "block-profile-highlights::item-foundation-1" ||
          listItemPath === "block-profile-highlights::item-foundation-2" ||
          listItemPath ===
            "group-experience-anonresume::list-experience-highlights::item-experience-1" ||
          listItemPath ===
            "group-experience-anonresume::list-experience-highlights::item-experience-2"
        ) {
          return createRect(16);
        }

        return createRect(0, 0);
      },
    });

    const initialDocument = createDefaultResumeDocument();
    const updatedDocument = {
      ...initialDocument,
      settings: {
        ...initialDocument.settings,
        typography: {
          ...initialDocument.settings.typography,
          lineHeight: 1.9,
        },
      },
    };
    const { rerender } = render(
      <ResumeRenderer document={initialDocument} mode="print" />,
    );

    await waitFor(() =>
      expect(
        (window as Window & { __ANON_RESUME_PRINT_READY__?: boolean })
          .__ANON_RESUME_PRINT_READY__,
      ).toBe(true),
    );
    expect(screen.getAllByTestId(/resume-page-/)).toHaveLength(1);

    rerender(<ResumeRenderer document={updatedDocument} mode="print" />);

    await waitFor(() =>
      expect(screen.getAllByTestId(/resume-page-/)).toHaveLength(2),
    );
  });

  it("keeps pagination stable when edit zoom scales the rendered canvas", async () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const sectionId = this.getAttribute?.("data-resume-section-id");
        const blockPath = this.getAttribute?.("data-resume-block-path");
        const listItemPath = this.getAttribute?.("data-resume-list-item-path");
        const isSectionTitle = this.hasAttribute?.("data-resume-section-title");

        if (sectionId === "section-profile") {
          return {
            width: 794,
            height: 560,
            top: 0,
            right: 794,
            bottom: 560,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (sectionId === "section-experience") {
          return {
            width: 794,
            height: 400,
            top: 0,
            right: 794,
            bottom: 400,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (isSectionTitle) {
          return {
            width: 794,
            height: 64,
            top: 0,
            right: 794,
            bottom: 64,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "block-profile-summary") {
          return {
            width: 794,
            height: 160,
            top: 0,
            right: 794,
            bottom: 160,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "block-profile-highlights") {
          return {
            width: 794,
            height: 160,
            top: 0,
            right: 794,
            bottom: 160,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (
          listItemPath === "block-profile-highlights::item-foundation-1" ||
          listItemPath === "block-profile-highlights::item-foundation-2"
        ) {
          return {
            width: 794,
            height: 74,
            top: 0,
            right: 794,
            bottom: 74,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "block-profile-stack") {
          return {
            width: 794,
            height: 141,
            top: 0,
            right: 794,
            bottom: 141,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume") {
          return {
            width: 794,
            height: 317,
            top: 0,
            right: 794,
            bottom: 317,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume::row-experience-header") {
          return {
            width: 794,
            height: 96,
            top: 0,
            right: 794,
            bottom: 96,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume::text-experience-context") {
          return {
            width: 794,
            height: 80,
            top: 0,
            right: 794,
            bottom: 80,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (blockPath === "group-experience-anonresume::list-experience-highlights") {
          return {
            width: 794,
            height: 125,
            top: 0,
            right: 794,
            bottom: 125,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        if (
          listItemPath === "group-experience-anonresume::list-experience-highlights::item-experience-1" ||
          listItemPath === "group-experience-anonresume::list-experience-highlights::item-experience-2"
        ) {
          return {
            width: 794,
            height: 56,
            top: 0,
            right: 794,
            bottom: 56,
            left: 0,
            x: 0,
            y: 0,
            toJSON() {
              return {};
            },
          };
        }

        return {
          width: 0,
          height: 0,
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        };
      },
    });

    render(
      <ResumeRenderer
        document={createDefaultResumeDocument()}
        mode="edit"
        zoom={0.8}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByTestId(/resume-page-/)).toHaveLength(2),
    );
  });
});
