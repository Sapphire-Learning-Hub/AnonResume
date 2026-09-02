import { render, screen, within } from "@testing-library/react";

import { ResumeDocumentDiffModal } from "@/components/editor/ResumeDocumentDiffModal";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";

function createDocumentsWithEveryDiffKind() {
  const sourceDocument = createDefaultResumeDocument();
  const targetDocument = createDefaultResumeDocument();

  sourceDocument.meta.title = "Senior Frontend Engineer";
  targetDocument.meta.title = "Principal Frontend Engineer";

  const targetBadges = targetDocument.sections[0]?.blocks[2];

  if (targetBadges?.type === "badges") {
    targetBadges.items = [
      ...targetBadges.items.filter((item) => item.id !== "badge-bun"),
      { id: "badge-typescript", text: "TypeScript" },
    ];
  }

  targetDocument.sections = [...targetDocument.sections].reverse();

  return { sourceDocument, targetDocument };
}

describe("ResumeDocumentDiffModal", () => {
  it("shows changes directly in two resume renderers instead of field cards", () => {
    const { sourceDocument, targetDocument } =
      createDocumentsWithEveryDiffKind();

    render(
      <ResumeDocumentDiffModal
        errorMessage="加载失败"
        footer={null}
        loadingMessage="加载中"
        open
        sourceDocument={sourceDocument}
        sourceLabel="历史版本"
        targetDocument={targetDocument}
        targetLabel="当前内容"
        title="版本差异"
        onCancel={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog");

    expect(
      within(dialog).getByTestId("diff-summary-added"),
    ).toHaveTextContent("新增 1");
    expect(
      within(dialog).getByTestId("diff-summary-removed"),
    ).toHaveTextContent("删除 1");
    expect(
      within(dialog).getByTestId("diff-summary-changed"),
    ).toHaveTextContent("修改 1");
    expect(
      within(dialog).getByTestId("diff-summary-moved"),
    ).toHaveTextContent("移动 2");

    const source = within(dialog).getByRole("region", {
      name: "历史版本简历",
    });
    const target = within(dialog).getByRole("region", {
      name: "当前内容简历",
    });

    expect(within(source).getByText("Bun").closest("[data-resume-diff-kind]"))
      .toHaveAttribute("data-resume-diff-kind", "removed");
    expect(
      within(target)
        .getByText("TypeScript")
        .closest("[data-resume-diff-kind]"),
    ).toHaveAttribute("data-resume-diff-kind", "added");
    expect(within(dialog).getByTestId("diff-page-setting-title"))
      .toHaveTextContent("Senior Frontend Engineer");
    expect(within(dialog).getByTestId("diff-page-setting-title"))
      .toHaveTextContent("Principal Frontend Engineer");
    expect(
      within(dialog).queryByTestId("diff-change-document-title"),
    ).not.toBeInTheDocument();
  });
});
