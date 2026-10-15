import { render, waitFor } from "@testing-library/react";

import { ResumePrintReadyFlag } from "@/components/resume/ResumePrintReadyFlag";

describe("ResumePrintReadyFlag", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "fonts");
    document.documentElement.removeAttribute("data-print-ready");
    document.documentElement.removeAttribute("data-resume-font-assets");
    window.__ANON_RESUME_PRINT_READY__ = false;
  });

  it("does not report print readiness while font assets are loading", () => {
    render(<ResumePrintReadyFlag fontAssetStatus="loading" ready />);
    expect(window.__ANON_RESUME_PRINT_READY__).toBe(false);
    expect(document.documentElement).toHaveAttribute("data-resume-font-assets", "loading");
  });

  it("does not report readiness when the requested browser font is unavailable", async () => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve(), check: () => false },
    });
    render(
      <ResumePrintReadyFlag
        fontAssetStatus="ready"
        fontLoadFamily='"Missing Font", serif'
        ready
      />,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-resume-font-assets", "error");
    });
    expect(window.__ANON_RESUME_PRINT_READY__).toBe(false);
  });
});
