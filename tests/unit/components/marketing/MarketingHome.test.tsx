import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import { MarketingHome } from "@/components/marketing/MarketingHome";
import { MarketingTemplateShowcase } from "@/components/marketing/MarketingTemplateShowcase";

describe("MarketingHome", () => {
  it("runs in-page navigation through the controlled scroll animation", () => {
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockReturnValue(1);
    const pushState = vi.spyOn(window.history, "pushState");
    const { container } = render(<MarketingHome />);
    const editorSection = container.querySelector<HTMLElement>("#editor");

    expect(editorSection).not.toBeNull();
    if (!editorSection) {
      throw new Error("Missing editor section");
    }
    vi.spyOn(editorSection, "getBoundingClientRect").mockReturnValue({
      bottom: 1800,
      height: 600,
      left: 0,
      right: 1200,
      toJSON: () => ({}),
      top: 1200,
      width: 1200,
      x: 0,
      y: 1200,
    });

    fireEvent.click(screen.getByRole("link", { name: "编辑体验" }));

    expect(pushState).toHaveBeenCalledWith(null, "", "#editor");
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    requestAnimationFrame.mockRestore();
    pushState.mockRestore();
  });

  it("condenses the navigation after the page starts scrolling", () => {
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 0,
    });
    const { container } = render(<MarketingHome />);

    const header = container.querySelector<HTMLElement>("header[data-scrolled]");
    expect(header).not.toBeNull();
    if (!header) {
      throw new Error("Missing marketing header");
    }
    expect(header).toHaveAttribute("data-scrolled", "false");

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 96,
    });
    fireEvent.scroll(window);

    expect(header).toHaveAttribute("data-scrolled", "true");
  });

  it("keeps one primary header action and omits section kickers", () => {
    const { container } = render(<MarketingHome />);

    expect(screen.queryByRole("link", { name: "登录" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "开始制作" })).not.toHaveLength(0);
    expect(
      screen.queryByText("简单好用 · 随心排版 · 所见即所得"),
    ).not.toBeInTheDocument();

    for (const [selector, kicker] of [
      ["#features", "为求职准备"],
      ["#editor", "轻松编辑"],
      ["#templates", "简历样式"],
      ["#typography", "字体选择"],
    ] as const) {
      const section = container.querySelector<HTMLElement>(selector);
      expect(section).not.toBeNull();
      if (!section) {
        throw new Error(`Missing marketing section: ${selector}`);
      }
      expect(within(section).queryByText(kicker)).not.toBeInTheDocument();
    }

    expect(screen.queryByText("三步完成")).not.toBeInTheDocument();
  });

  it("lets visitors compare every non-blank resume template", async () => {
    render(<MarketingTemplateShowcase />);

    const centered = await screen.findByRole("button", { name: "居中叙事" });
    const classic = screen.getByRole("button", { name: "经典留白" });
    const modular = screen.getByRole("button", { name: "等宽模块" });
    const compact = screen.getByRole("button", { name: "紧凑单页" });

    expect(centered).toHaveAttribute("aria-pressed", "true");
    expect(classic).toHaveAttribute("aria-pressed", "false");
    expect(modular).toHaveAttribute("aria-pressed", "false");
    expect(compact).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(modular);

    expect(centered).toHaveAttribute("aria-pressed", "false");
    expect(modular).toHaveAttribute("aria-pressed", "true");
  });

  it("advances the template preview as the desktop scroll track progresses", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 1160,
    });
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const { container } = render(
      <section style={{ scrollMarginTop: 86 }}>
        <MarketingTemplateShowcase />
      </section>,
    );
    const centered = await screen.findByRole("button", { name: "居中叙事" });
    const classic = screen.getByRole("button", { name: "经典留白" });
    const scrollTrack = container.querySelector<HTMLElement>(
      "[data-template-scroll-track]",
    );
    const stickyFrame = container.querySelector<HTMLElement>(
      "[data-template-sticky-frame]",
    );

    expect(scrollTrack).not.toBeNull();
    expect(stickyFrame).not.toBeNull();
    if (!scrollTrack || !stickyFrame) {
      throw new Error("Missing template scroll layout");
    }
    expect(
      within(stickyFrame).getByRole("heading", {
        name: "换一种风格，不必重新写一遍",
      }),
    ).toBeInTheDocument();
    const section = scrollTrack.closest("section");
    expect(section).not.toBeNull();
    if (!section) {
      throw new Error("Missing template section");
    }

    Object.defineProperty(scrollTrack, "offsetHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(stickyFrame, "offsetHeight", {
      configurable: true,
      value: 720,
    });
    vi.spyOn(scrollTrack, "getBoundingClientRect").mockReturnValue({
      bottom: 2000,
      height: 2000,
      left: 0,
      right: 1200,
      toJSON: () => ({}),
      top: 0,
      width: 1200,
      x: 0,
      y: 0,
    });
    vi.spyOn(section, "getBoundingClientRect").mockReturnValue({
      bottom: 2868,
      height: 3141,
      left: 0,
      right: 1200,
      toJSON: () => ({}),
      top: -273,
      width: 1200,
      x: 0,
      y: -273,
    });

    fireEvent.scroll(window);

    expect(centered).toHaveAttribute("aria-pressed", "false");
    expect(classic).toHaveAttribute("aria-pressed", "true");

    requestAnimationFrame.mockRestore();
  });

  it("reserves a standard 16:9 frame for the editor screenshot", () => {
    render(<MarketingHome />);

    const image = screen.getByAltText("AnonResume 简历编辑器界面");

    expect(image).toHaveAttribute(
      "src",
      expect.stringContaining("editor-modular-16x9-v2-2048.webp"),
    );
    expect(image).toHaveAttribute("width", "2048");
    expect(image).toHaveAttribute("height", "1152");
  });
});
