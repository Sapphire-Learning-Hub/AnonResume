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

  it("renders a searchable template market with direct-use forms", () => {
    render(
      <ResumeTemplatePicker
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /^模板中心/ });

    expect(within(dialog).getByRole("searchbox", { name: "搜索模板" })).toBeInTheDocument();
    expect(within(dialog).getByRole("navigation", { name: "模板分类" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "全部模板" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const modularCard = within(dialog)
      .getByRole("article", { name: "等宽模块" });
    const form = modularCard.querySelector("form");

    expect(form).toHaveAttribute("action", "/app/create-resume");
    expect(form?.querySelector('input[name="templateId"]')).toHaveValue("modular");
    expect(within(modularCard).getByRole("button", { name: /^使\s*用$/ })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("filters templates by collection and localized search terms", () => {
    render(
      <ResumeTemplatePicker
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
      />,
    );

    const dialog = screen.getByRole("dialog", { name: /^模板中心/ });

    fireEvent.click(within(dialog).getByRole("button", { name: "紧凑" }));

    expect(within(dialog).getByText("紧凑单页")).toBeInTheDocument();
    expect(within(dialog).queryByText("经典留白")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "全部模板" }));
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "搜索模板" }), {
      target: { value: "技术" },
    });

    expect(within(dialog).getByText("等宽模块")).toBeInTheDocument();
    expect(within(dialog).queryByText("紧凑单页")).not.toBeInTheDocument();
  });

  it("opens a full template preview without leaving the market", () => {
    render(
      <ResumeTemplatePicker
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
      />,
    );

    const market = screen.getByRole("dialog", { name: /^模板中心/ });
    const classicCard = within(market).getByRole("article", { name: "经典留白" });

    fireEvent.click(within(classicCard).getByRole("button", { name: /^预\s*览$/ }));

    const preview = screen
      .getByRole("button", { name: "返回模板中心" })
      .closest<HTMLElement>('[role="dialog"]');

    expect(preview).not.toBeNull();
    if (!preview) {
      throw new Error("Expected the template preview dialog to open");
    }

    expect(preview).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: "使用此模板" })).toHaveAttribute(
      "type",
      "submit",
    );
    expect(market).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "关闭模板中心" }));

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

    expect(screen.getByRole("dialog", { name: /^模板中心/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入 Markdown" })).not.toBeInTheDocument();
  });

  it("keeps card focus and actions inside edge cards", () => {
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

    expect(styleText).toMatch(/box-shadow:\s*inset 0 0 0 2px/);
  });

  it("returns mobile resume creation to the workbench", () => {
    installEditorViewport(false);

    render(
      <ResumeTemplatePicker
        createAction="/app/create-resume"
        onClose={vi.fn()}
        open
      />,
    );

    const market = screen.getByRole("dialog", { name: /^模板中心/ });
    const forms = market.querySelectorAll("form");

    expect(forms).toHaveLength(5);
    forms.forEach((form) => {
      expect(form.querySelector('input[name="returnTo"]')).toHaveValue("/app");
    });
  });
});
