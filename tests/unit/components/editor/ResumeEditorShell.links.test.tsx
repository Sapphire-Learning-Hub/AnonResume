import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    notification: {
      destroy: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
    toast: { error: vi.fn() },
  }),
}));

import { ResumeEditorShell } from "@/components/editor/ResumeEditorShell";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import type { RichTextContent } from "@/domain/resume/schema";

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

function spacedLabel(text: string) {
  return new RegExp(text.split("").join("\\s*"));
}

function openRibbonTab(name: "插入") {
  fireEvent.click(screen.getByRole("tab", { name }));
}

class MockResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

describe("ResumeEditorShell link editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("edits an existing text link from the Insert ribbon", () => {
    const initialDocument = createDefaultResumeDocument();
    const profileSection = initialDocument.sections[0];
    profileSection.blocks = [{
      ...profileSection.blocks[0],
      type: "text",
      content: richText("共享渲染器基础", [
        { type: "link", attrs: { href: "https://example.com" } },
      ]),
    }];
    initialDocument.sections = [profileSection];

    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={initialDocument}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    openRibbonTab("插入");
    fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "链接" }));
    const linkDialog = within(screen.getByRole("dialog"));
    fireEvent.change(linkDialog.getByRole("textbox", { name: "显示文字" }), {
      target: { value: "联系我" },
    });
    fireEvent.click(linkDialog.getByRole("button", { name: "电子邮件" }));
    fireEvent.change(linkDialog.getByRole("textbox", { name: "电子邮件地址" }), {
      target: { value: "hello@example.com" },
    });
    fireEvent.change(linkDialog.getByRole("textbox", { name: "主题" }), {
      target: { value: "简历咨询" },
    });
    fireEvent.click(linkDialog.getByRole("button", { name: spacedLabel("确定") }));

    expect(
      within(screen.getByRole("textbox", { name: "文本块编辑器" })).getByRole("link", { name: "联系我" }),
    ).toHaveAttribute("href", "mailto:hello@example.com?subject=%E7%AE%80%E5%8E%86%E5%92%A8%E8%AF%A2");
  });

  it("can remove an existing link from the link dialog", () => {
    const initialDocument = createDefaultResumeDocument();
    initialDocument.sections[0].blocks[0] = {
      ...initialDocument.sections[0].blocks[0],
      type: "text",
      content: richText("共享渲染器基础", [
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
    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: "链接" }));
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("清除链接") }));

    expect(
      within(screen.getByRole("textbox", { name: "文本块编辑器" })).queryByRole("link"),
    ).not.toBeInTheDocument();
  });

  it("inserts a section link that points to a resume section", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    openRibbonTab("插入");
    fireEvent.click(screen.getByRole("button", { name: "链接" }));
    fireEvent.change(screen.getByRole("textbox", { name: "显示文字" }), {
      target: { value: "跳到工作经历" },
    });
    fireEvent.click(screen.getByRole("button", { name: "简历内位置" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
      name: "经历",
    }));
    fireEvent.click(screen.getByRole("button", { name: spacedLabel("确定") }));

    expect(
      within(screen.getByRole("textbox", { name: "文本块编辑器" })).getByRole("link", {
        name: "跳到工作经历",
      }),
    ).toHaveAttribute("href", "#resume-section-section-experience");
  });

  it("opens the same link dialog with the editor shortcut", () => {
    render(
      <ResumeEditorShell
        resumeId="resume-demo"
        initialDocument={createDefaultResumeDocument()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "共享渲染器基础" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "文本块编辑器" }), {
      key: "k",
      metaKey: true,
    });

    expect(screen.getByRole("dialog", { name: "插入超链接" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "显示文字" })).toBeInTheDocument();
  });
});
