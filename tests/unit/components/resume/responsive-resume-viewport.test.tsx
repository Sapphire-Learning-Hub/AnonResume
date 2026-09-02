import { render, screen, waitFor } from "@testing-library/react";

import {
  getResponsiveViewportMetrics,
  ResponsiveResumeViewport,
} from "@/components/resume/ResponsiveResumeViewport";

const resizeObservers: Array<{
  callback: ResizeObserverCallback;
}> = [];

class MockResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push({ callback });
  }

  observe() {}

  unobserve() {}

  disconnect() {}
}

describe("ResponsiveResumeViewport", () => {
  beforeEach(() => {
    resizeObservers.length = 0;
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("computes a fitting scale when content is wider than the viewport", () => {
    expect(
      getResponsiveViewportMetrics({
        containerWidth: 390,
        contentWidth: 794,
        contentHeight: 1123,
      }),
    ).toEqual({
      scale: 0.4912,
      width: 391,
      height: 552,
    });
  });

  it("keeps full scale when the viewport is already wide enough", () => {
    expect(
      getResponsiveViewportMetrics({
        containerWidth: 1024,
        contentWidth: 794,
        contentHeight: 1123,
      }),
    ).toEqual({
      scale: 1,
      width: 794,
      height: 1123,
    });
  });

  it("scales rendered content down to fit a narrow container", async () => {
    render(
      <ResponsiveResumeViewport>
        <div data-testid="resume-content">Example</div>
      </ResponsiveResumeViewport>,
    );

    const viewport = screen.getByTestId("responsive-resume-viewport");
    const slot = screen.getByTestId("responsive-resume-slot");
    const content = screen.getByTestId("responsive-resume-content");
    const inner = screen.getByTestId("resume-content");

    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(content, "scrollWidth", {
      configurable: true,
      value: 794,
    });
    Object.defineProperty(content, "scrollHeight", {
      configurable: true,
      value: 1123,
    });

    for (const observer of resizeObservers) {
      observer.callback([], {} as ResizeObserver);
    }

    await waitFor(() =>
      expect(content).toHaveStyle({
        transform: "scale(0.4912)",
      }),
    );
    expect(viewport).toHaveStyle({
      overflowX: "hidden",
    });
    expect(slot).toHaveStyle({
      width: "391px",
      height: "552px",
      margin: "0 auto",
    });
    expect(inner).toBeInTheDocument();
  });

  it("uses a readable reflow instead of scaling down when mobile reflow is enabled", async () => {
    render(
      <ResponsiveResumeViewport reflowAt={640}>
        <div data-testid="resume-content">Example</div>
      </ResponsiveResumeViewport>,
    );

    const viewport = screen.getByTestId("responsive-resume-viewport");
    const slot = screen.getByTestId("responsive-resume-slot");
    const content = screen.getByTestId("responsive-resume-content");

    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(content, "scrollWidth", {
      configurable: true,
      value: 794,
    });
    Object.defineProperty(content, "scrollHeight", {
      configurable: true,
      value: 1123,
    });

    for (const observer of resizeObservers) {
      observer.callback([], {} as ResizeObserver);
    }

    await waitFor(() =>
      expect(content).toHaveStyle({
        position: "relative",
        width: "100%",
        transform: "none",
      }),
    );
    expect(slot).toHaveStyle({
      width: "100%",
      height: "auto",
    });
  });
});
