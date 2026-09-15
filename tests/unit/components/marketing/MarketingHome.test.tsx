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

  it("keeps template indicators non-interactive and omits the preview kicker", async () => {
    const { container } = render(<MarketingTemplateShowcase />);

    expect((await screen.findAllByText("居中叙事")).length).toBeGreaterThan(0);
    expect(screen.getByText("经典留白")).toBeInTheDocument();
    expect(screen.getByText("等宽模块")).toBeInTheDocument();
    expect(screen.getByText("紧凑单页")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "居中叙事" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("编辑器真实效果")).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-template-indicator="centered"]'),
    ).toHaveAttribute("data-active", "true");
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
    await screen.findAllByText("居中叙事");
    const centered = container.querySelector<HTMLElement>(
      '[data-template-indicator="centered"]',
    );
    const classic = container.querySelector<HTMLElement>(
      '[data-template-indicator="classic"]',
    );
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

    expect(centered).toHaveAttribute("data-active", "false");
    expect(classic).toHaveAttribute("data-active", "true");

    requestAnimationFrame.mockRestore();
  });

});
