import { fireEvent, render, screen, within } from "@testing-library/react";

import { ResumeTemplatePicker } from "@/components/dashboard/ResumeTemplatePicker";

describe("ResumeTemplatePicker", () => {
  function installEditorViewport(matches: boolean) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  it("opens with Blank selected and submits the chosen template", () => {
    render(
      <ResumeTemplatePicker
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "选择简历模板" });
    const blank = within(dialog).getByRole("radio", { name: /空白简历/ });
    const frontend = within(dialog).getByRole("radio", { name: /前端版/ });

    expect(blank).toHaveAttribute("aria-checked", "true");
    expect(blank).toHaveAttribute("data-selected", "true");
    expect(frontend).toHaveAttribute("aria-checked", "false");
    expect(frontend).toHaveAttribute("data-selected", "false");

    fireEvent.keyDown(frontend, { key: " " });

    expect(frontend).toHaveAttribute("aria-checked", "true");
    expect(frontend).toHaveAttribute("data-selected", "true");
    expect(frontend.querySelector('[data-selection-mark="true"]')).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(
      within(dialog)
        .getByTestId("create-resume-template-form")
        .querySelector('input[name="templateId"]'),
    ).toHaveValue("frontend");
  });

  it("closes without submitting", () => {
    const onClose = vi.fn();

    render(
      <ResumeTemplatePicker
        createAction="/app/create-resume"
        onClose={onClose}
        open
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps import formats out of the template creation flow", () => {
    render(
      <ResumeTemplatePicker
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
      />,
    );

    expect(screen.getByRole("dialog", { name: "选择简历模板" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入 Markdown" })).not.toBeInTheDocument();
  });

  it("keeps selection and focus rings inside edge cards", () => {
    render(
      <ResumeTemplatePicker
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
      />,
    );

    const styleText = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(styleText).toMatch(/box-shadow:\s*inset 0 0 0 1px/);
    expect(styleText).toMatch(/box-shadow:\s*inset 0 0 0 2px/);
  });

  it("returns mobile resume creation to the workbench", async () => {
    installEditorViewport(false);

    render(
      <ResumeTemplatePicker
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
      />,
    );

    const form = screen.getByTestId("create-resume-template-form");

    expect(form.querySelector('input[name="returnTo"]')).toHaveValue("/app");
  });
});
