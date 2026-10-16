import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { MarkdownEditingWorkspace } from "@/components/editor/markdown/MarkdownEditingWorkspace";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { serializeResumeMarkdown } from "@/domain/resume/markdown";

describe("MarkdownEditingWorkspace", () => {
  it("renders an accessible source pane and inert shared-renderer preview", async () => {
    const document = createDefaultResumeDocument("zh-CN");
    const source = serializeResumeMarkdown(document).source;
    const onPageCountChange = vi.fn();

    render(
      <MarkdownEditingWorkspace
        diagnostics={[]}
        document={document}
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
        zoom={1}
        getDiagnosticMessage={(diagnostic) => diagnostic.code}
        onPageCountChange={onPageCountChange}
        onPaginationReadyChange={() => undefined}
        onSourceChange={() => undefined}
      />,
    );

    expect(
      screen.getByRole("textbox", { name: "Markdown 源码" }),
    ).toBeInTheDocument();
    const preview = screen.getByRole("region", { name: "只读预览" });
    expect(preview).toHaveAttribute("inert");
    expect(within(preview).getByRole("article")).toBeInTheDocument();
    expect(within(preview).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(preview).queryByRole("button", { name: /拖动/ })).not.toBeInTheDocument();
    await waitFor(() => expect(onPageCountChange).toHaveBeenCalled());
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
        document={document}
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
        zoom={1}
        getDiagnosticMessage={() => "块指令未闭合"}
        onPageCountChange={() => undefined}
        onPaginationReadyChange={() => undefined}
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
