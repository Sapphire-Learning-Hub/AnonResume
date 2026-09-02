import { fireEvent, render, screen, within } from "@testing-library/react";

import { ResumeDiffCanvas } from "@/components/editor/ResumeDiffCanvas";
import { createResumeDiffPresentation } from "@/components/resume/resume-diff-presentation";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { compareResumeDocuments } from "@/domain/resume/document-diff";
import { getResumeFontPreset } from "@/domain/resume/font-presets";

function createDiffFixture() {
  const sourceDocument = createDefaultResumeDocument();
  const targetDocument = createDefaultResumeDocument();
  const sourceSummary = sourceDocument.sections[0]?.blocks[0];
  const targetSummary = targetDocument.sections[0]?.blocks[0];

  if (sourceSummary?.type !== "text" || targetSummary?.type !== "text") {
    throw new Error("default summary block missing");
  }

  sourceSummary.content.content[0]!.content = [
    { type: "text", text: "基于共享渲染器的简历编辑器" },
  ];
  targetSummary.content.content[0]!.content = [
    { type: "text", text: "面向共享渲染器的简历编辑器" },
  ];
  targetDocument.settings.theme.accent = "#d6336c";
  targetDocument.meta.locale = "en-US";
  targetDocument.settings.page.margin = {
    top: 24,
    right: 28,
    bottom: 24,
    left: 28,
  };
  targetDocument.settings.typography.fontFamily =
    getResumeFontPreset("manrope")!.fontFamily;

  const result = compareResumeDocuments(sourceDocument, targetDocument);

  return {
    sourceDocument,
    targetDocument,
    result,
    presentation: createResumeDiffPresentation(result),
  };
}

describe("ResumeDiffCanvas", () => {
  it("renders two real resume canvases with summary and page-setting changes", () => {
    const fixture = createDiffFixture();

    render(
      <ResumeDiffCanvas
        {...fixture}
        sourceLabel="历史版本"
        targetLabel="当前内容"
      />,
    );

    const source = screen.getByRole("region", { name: "历史版本简历" });
    const target = screen.getByRole("region", { name: "当前内容简历" });

    expect(within(source).getByText("基于").tagName).toBe("DEL");
    expect(within(target).getByText("面向").tagName).toBe("INS");
    expect(screen.getByTestId("diff-summary-changed")).toHaveTextContent(
      "修改 5",
    );
    expect(screen.getByTestId("diff-page-setting-theme.accent")).toHaveTextContent(
      "#0f62fe",
    );
    expect(screen.getByTestId("diff-page-setting-theme.accent")).toHaveTextContent(
      "#d6336c",
    );
    const fontFamilySetting = screen.getByTestId(
      "diff-page-setting-typography.fontFamily",
    );
    expect(fontFamilySetting).toHaveTextContent("IBM Plex Sans");
    expect(fontFamilySetting).toHaveTextContent("Manrope");
    expect(fontFamilySetting).not.toHaveTextContent("Segoe UI");
    expect(fontFamilySetting).not.toHaveTextContent("sans-serif");
    expect(screen.getByTestId("diff-page-setting-locale")).toHaveTextContent(
      "简体中文",
    );
    expect(screen.getByTestId("diff-page-setting-locale")).toHaveTextContent(
      "English",
    );
    expect(screen.getByTestId("diff-page-setting-page.margin")).toHaveTextContent(
      "上 32 · 右 32 · 下 32 · 左 32",
    );
    expect(screen.getByTestId("diff-page-setting-page.margin")).toHaveTextContent(
      "上 24 · 右 28 · 下 24 · 左 28",
    );
  });

  it("navigates changes and keeps the pane scroll progress synchronized", () => {
    const fixture = createDiffFixture();

    render(
      <ResumeDiffCanvas
        {...fixture}
        sourceLabel="历史版本"
        targetLabel="当前内容"
      />,
    );

    expect(screen.getByText(`第 1 / ${fixture.result.summary.total} 处`))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一处变化" }));
    expect(screen.getByText(`第 2 / ${fixture.result.summary.total} 处`))
      .toBeInTheDocument();

    const sourceViewport = screen.getByTestId("diff-source-viewport");
    const targetViewport = screen.getByTestId("diff-target-viewport");

    Object.defineProperties(sourceViewport, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 200 },
    });
    Object.defineProperties(targetViewport, {
      scrollHeight: { configurable: true, value: 2200 },
      clientHeight: { configurable: true, value: 200 },
    });
    sourceViewport.scrollTop = 500;
    fireEvent.scroll(sourceViewport);

    expect(targetViewport.scrollTop).toBe(1000);
  });
});
