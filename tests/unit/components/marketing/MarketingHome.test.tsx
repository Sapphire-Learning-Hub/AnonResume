import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import {
  DEFAULT_PUBLIC_RUNTIME_CONFIG,
  PublicRuntimeConfigProvider,
  type PublicRuntimeConfig,
} from "@/components/config/PublicRuntimeConfigProvider";
import { MarketingHome } from "@/components/marketing/MarketingHome";
import { MarketingTemplateShowcase } from "@/components/marketing/MarketingTemplateShowcase";

describe("MarketingHome", () => {
  function renderWithConfiguration(
    overrides: Partial<PublicRuntimeConfig> = {},
  ) {
    return render(
      <PublicRuntimeConfigProvider
        value={{ ...DEFAULT_PUBLIC_RUNTIME_CONFIG, ...overrides }}
      >
        <MarketingHome />
      </PublicRuntimeConfigProvider>,
    );
  }

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

  it("links the AI navigation item to the AI card in the feature grid", () => {
    const { container } = render(<MarketingHome />);
    const aiSection = container.querySelector<HTMLElement>("#ai-assistant");

    expect(aiSection).not.toBeNull();
    expect(aiSection?.closest("#features")).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "AI 助手" }),
    ).toHaveAttribute("href", "#ai-assistant");
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

  it("groups product, legal, and open-source footer destinations", () => {
    renderWithConfiguration();

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("heading", { name: "产品" }))
      .toBeInTheDocument();
    expect(within(footer).getByRole("heading", { name: "法律" }))
      .toBeInTheDocument();
    expect(within(footer).getByRole("heading", { name: "开源" }))
      .toBeInTheDocument();
    expect(within(footer).getByRole("link", { name: "帮助中心" }))
      .toHaveAttribute("href", "/docs");
    expect(within(footer).getByRole("link", { name: "获取支持" }))
      .toHaveAttribute("href", "/docs/support");
    expect(within(footer).getByRole("link", { name: "隐私政策" }))
      .toHaveAttribute("href", "/privacy");
    expect(within(footer).getByRole("link", { name: "服务条款" }))
      .toHaveAttribute("href", "/terms");
  });

  it("marks configured legal and support destinations as external", () => {
    renderWithConfiguration({
      privacyPolicyUrl: "https://legal.example.com/privacy",
      supportUrl: "https://support.example.com",
      termsOfServiceUrl: "https://legal.example.com/terms",
    });

    const footer = screen.getByRole("contentinfo");
    for (const name of ["获取支持", "隐私政策", "服务条款"]) {
      expect(within(footer).getByRole("link", { name: new RegExp(name) }))
        .toHaveAttribute("target", "_blank");
    }
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
