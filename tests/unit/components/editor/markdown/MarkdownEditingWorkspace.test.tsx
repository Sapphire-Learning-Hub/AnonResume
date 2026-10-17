import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MarkdownEditingWorkspace } from "@/components/editor/markdown/MarkdownEditingWorkspace";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { serializeResumeMarkdown } from "@/domain/resume/markdown";

describe("MarkdownEditingWorkspace", () => {
  it("renders an accessible source pane for the editor shell", () => {
    const source = [
      "## 项目",
      "",
      ":::row {gap=16}",
      "### 项目 A",
      "",
      "- 负责核心模块",
      "",
      "### 项目 B",
      "",
      "- 改善交付质量",
      ":::",
      "",
    ].join("\n");

    render(
      <MarkdownEditingWorkspace
        diagnostics={[]}
        labels={{
          diagnostics: "问题",
          emptyDiagnostics: "没有问题",
          error: "错误",
          line: "第 {line} 行",
          preview: "只读预览",
          source: "Markdown 源码",
          stalePreview: "预览未包含当前错误修改",
          warning: "警告",
        }}
        source={source}
        getDiagnosticMessage={(diagnostic) => diagnostic.code}
        onSourceChange={() => undefined}
      />,
    );

    expect(
      screen.getByRole("textbox", { name: "Markdown 源码" }),
    ).toHaveTextContent("## 项目");
    expect(source).not.toContain(":::group");
    expect(screen.queryByRole("region", { name: "只读预览" })).not.toBeInTheDocument();
  });

  it("shows stale-preview state and lets diagnostics focus the source", async () => {
    const document = createDefaultResumeDocument("zh-CN");
    const diagnostic = {
      severity: "error" as const,
      code: "block_unclosed_directive",
      parameters: { name: "group" },
      line: 12,
      column: 1,
    };

    render(
      <MarkdownEditingWorkspace
        diagnostics={[diagnostic]}
        isPreviewStale
        labels={{
          diagnostics: "问题",
          emptyDiagnostics: "没有问题",
          error: "错误",
          line: "第 {line} 行",
          preview: "只读预览",
          source: "Markdown 源码",
          stalePreview: "预览未包含当前错误修改",
          warning: "警告",
        }}
        source={serializeResumeMarkdown(document).source}
        getDiagnosticMessage={() => "块指令未闭合"}
        onSourceChange={() => undefined}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "预览未包含当前错误修改",
    );
    fireEvent.click(screen.getByRole("button", { name: /第 12 行.*块指令未闭合/ }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Markdown 源码" })).toHaveFocus(),
    );
  });
});
