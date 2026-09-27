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

function createBadgeTestDocument() {
  const document = createDefaultResumeDocument();
  const profileSection = document.sections[0];
  const badges = profileSection.blocks.find((block) => block.type === "badges");

  if (!badges) {
    throw new Error("Expected profile stack to remain a badge block.");
  }

  document.sections = [{ ...profileSection, blocks: [badges] }];
  return document;
}

function getInspectorPanel() {
  const propertiesTab = screen.queryByRole("tab", { name: /格式$/ })
    ?? screen.getByRole("tab", { name: "设计" });

  if (propertiesTab.getAttribute("aria-selected") !== "true") {
    fireEvent.click(propertiesTab);
  }

  return screen.getByRole("tabpanel");
}

class MockResizeObserver {
  observe() {}

  unobserve() {}

  disconnect() {}
}

describe("ResumeEditorShell badge editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("edits a badge directly on the canvas while keeping structural actions in the ribbon", () => {
    render(<ResumeEditorShell resumeId="resume-demo" initialDocument={createBadgeTestDocument()} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑标签 Next.js" }));

    const badgeInput = screen.getByRole("textbox", { name: "标签文本" });
    const dialog = getInspectorPanel();

    expect(badgeInput).toHaveFocus();
    expect(badgeInput).toHaveTextContent("Next.js");
    expect(within(dialog).queryByRole("group", { name: "标签内容" })).not.toBeInTheDocument();

    badgeInput.textContent = "TypeScript";
    fireEvent.input(badgeInput);
    fireEvent.blur(badgeInput);
    fireEvent.click(screen.getByRole("button", { name: "编辑标签 React" }));

    expect(screen.getByRole("button", { name: "编辑标签 TypeScript" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑标签 Next.js" })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "新增标签" }));

    expect(screen.getByRole("textbox", { name: "标签文本" })).toHaveTextContent("新标签");

    fireEvent.click(within(dialog).getByRole("button", { name: "删除标签" }));

    expect(screen.queryByRole("button", { name: "编辑标签 新标签" })).not.toBeInTheDocument();
  });

  it("allows a temporarily empty badge and removes it when editing ends", () => {
    render(<ResumeEditorShell resumeId="resume-demo" initialDocument={createBadgeTestDocument()} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑标签 Next.js" }));
    const badgeInput = screen.getByRole("textbox", { name: "标签文本" });

    badgeInput.textContent = "";
    fireEvent.input(badgeInput);
    expect(badgeInput).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "编辑标签 React" })).toBeInTheDocument();

    fireEvent.blur(badgeInput);

    expect(screen.queryByRole("button", { name: "编辑标签 Next.js" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "标签文本" })).toHaveTextContent("React");
  });

  it("keeps badge edits when selecting a different badge without an explicit blur", () => {
    render(<ResumeEditorShell resumeId="resume-demo" initialDocument={createBadgeTestDocument()} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑标签 Next.js" }));
    const badgeEditor = screen.getByRole("textbox", { name: "标签文本" });
    badgeEditor.textContent = "TypeScript";
    fireEvent.input(badgeEditor);
    fireEvent.click(screen.getByRole("button", { name: "编辑标签 React" }));

    expect(screen.getByRole("button", { name: "编辑标签 TypeScript" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "标签文本" })).toHaveTextContent("React");
  });

  it("commits repeated edits to the same selected badge", () => {
    render(<ResumeEditorShell resumeId="resume-demo" initialDocument={createBadgeTestDocument()} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑标签 Next.js" }));
    const badgeEditor = screen.getByRole("textbox", { name: "标签文本" });
    badgeEditor.textContent = "TypeScript";
    fireEvent.input(badgeEditor);
    fireEvent.blur(badgeEditor);

    expect(badgeEditor).toBeInTheDocument();
    badgeEditor.textContent = "Kotlin";
    fireEvent.input(badgeEditor);
    fireEvent.blur(badgeEditor);
    fireEvent.click(screen.getByRole("button", { name: "编辑标签 React" }));

    expect(screen.getByRole("button", { name: "编辑标签 Kotlin" })).toBeInTheDocument();
  });

  it("removes the badge block when its final badge is cleared", () => {
    const initialDocument = createBadgeTestDocument();
    const badges = initialDocument.sections[0]?.blocks[0];

    if (badges?.type !== "badges") {
      throw new Error("Expected profile stack to remain a badge block.");
    }

    badges.items = [badges.items[0]!];
    render(<ResumeEditorShell resumeId="resume-demo" initialDocument={initialDocument} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑标签 Next.js" }));
    const badgeInput = screen.getByRole("textbox", { name: "标签文本" });
    badgeInput.textContent = "";
    fireEvent.input(badgeInput);
    fireEvent.blur(badgeInput);

    expect(screen.queryByRole("textbox", { name: "标签文本" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑标签 Next.js" })).not.toBeInTheDocument();
    expect(screen.queryByText("标签操作")).not.toBeInTheDocument();
  });

  it("allows deleting the final badge and removes its empty badge block", () => {
    const initialDocument = createBadgeTestDocument();
    const badges = initialDocument.sections[0]?.blocks[0];

    if (badges?.type !== "badges") {
      throw new Error("Expected profile stack to remain a badge block.");
    }

    badges.items = [badges.items[0]!];
    render(<ResumeEditorShell resumeId="resume-demo" initialDocument={initialDocument} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑标签 Next.js" }));
    const deleteButton = within(getInspectorPanel()).getByRole("button", { name: "删除标签" });

    expect(deleteButton).toBeEnabled();
    fireEvent.click(deleteButton);

    expect(screen.queryByRole("button", { name: "编辑标签 Next.js" })).not.toBeInTheDocument();
  });
});
