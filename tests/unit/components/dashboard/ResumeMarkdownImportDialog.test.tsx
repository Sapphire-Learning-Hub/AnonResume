import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ResumeMarkdownImportDialog } from "@/components/dashboard/ResumeMarkdownImportDialog";

function finishMotion(element: HTMLElement) {
  for (const eventName of [
    "animationend",
    "webkitAnimationEnd",
    "transitionend",
    "webkitTransitionEnd",
  ]) {
    element.dispatchEvent(new Event(eventName, { bubbles: true }));
  }
}

const mujicvSource = [
  "# Imported Person",
  "",
  ":::left",
  "",
  "icon:phone 123456",
  "",
  ":::",
  "",
  "## Experience",
  "",
  "- Built an importer",
].join("\n");

describe("ResumeMarkdownImportDialog", () => {
  it("parses pasted Mujicv Markdown and prepares a new-resume form", async () => {
    render(
      <ResumeMarkdownImportDialog
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
        returnTo="editor"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "导入 Markdown 简历" });
    const source = within(dialog).getByLabelText("Markdown 内容");

    expect(within(dialog).getByRole("radio", { name: "木及简历" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: "Mujicv" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("更多产品适配中……")).toBeInTheDocument();

    fireEvent.change(source, { target: { value: mujicvSource } });
    fireEvent.click(within(dialog).getByRole("button", { name: "解析预览" }));

    expect(await within(dialog).findByText("Imported Person")).toBeInTheDocument();
    expect(within(dialog).getByText("2 个区块")).toBeInTheDocument();
    expect(within(dialog).getByText("已自动识别为木及简历 Markdown")).toBeInTheDocument();
    expect(within(dialog).getByText("123456")).toBeInTheDocument();

    const form = within(dialog).getByTestId("create-markdown-resume-form");

    expect(form).toHaveAttribute("action", "/app/create-resume");
    expect(form.querySelector('input[name="creationMode"]')).toHaveValue("markdown");
    expect(form.querySelector('input[name="dialect"]')).toHaveValue("auto");
    expect(form.querySelector('input[name="returnTo"]')).toHaveValue("editor");
    expect(form.querySelector('textarea[name="markdown"]')).toHaveValue(mujicvSource);
    expect(within(dialog).getByRole("button", { name: "创建导入简历" }))
      .toBeEnabled();
  });

  it("shows blocking errors and keeps creation disabled", async () => {
    render(
      <ResumeMarkdownImportDialog
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
        returnTo="/app"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "导入 Markdown 简历" });

    fireEvent.click(within(dialog).getByRole("button", { name: "解析预览" }));

    expect(await within(dialog).findByText("Markdown 内容不能为空")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "创建导入简历" }))
      .toBeDisabled();
    expect(
      within(dialog)
        .getByTestId("create-markdown-resume-form")
        .querySelector('input[name="returnTo"]'),
    ).toHaveValue("/app");
  });

  it("reads a selected Markdown file into the source editor", async () => {
    render(
      <ResumeMarkdownImportDialog
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
        returnTo="editor"
      />,
    );

    const file = new File([mujicvSource], "resume.md", {
      type: "text/markdown",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue(mujicvSource),
    });
    const input = screen.getByTestId("markdown-file-input");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByLabelText("Markdown 内容")).toHaveValue(mujicvSource);
    });
  });

  it("resets source and preview after closing", async () => {
    const { rerender } = render(
      <ResumeMarkdownImportDialog
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
        returnTo="editor"
      />,
    );

    fireEvent.change(screen.getByLabelText("Markdown 内容"), {
      target: { value: mujicvSource },
    });
    fireEvent.click(screen.getByRole("button", { name: "解析预览" }));
    expect(await screen.findByText("Imported Person")).toBeInTheDocument();

    rerender(
      <ResumeMarkdownImportDialog
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open={false}
        returnTo="editor"
      />,
    );

    const closingDialog = screen.getByRole("dialog", {
      name: "导入 Markdown 简历",
    });

    await waitFor(() => {
      expect(closingDialog).toHaveClass("ant-zoom-leave-active");
    });
    finishMotion(closingDialog);

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "导入 Markdown 简历" }),
      ).not.toBeInTheDocument();
    });

    rerender(
      <ResumeMarkdownImportDialog
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
        returnTo="editor"
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Markdown 内容")).toHaveValue("");
    });
    expect(screen.queryByText("Imported Person")).not.toBeInTheDocument();
  });
});
