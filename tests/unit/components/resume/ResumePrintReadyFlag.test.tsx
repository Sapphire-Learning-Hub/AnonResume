import { render, waitFor } from "@testing-library/react";

import { ResumePrintReadyFlag } from "@/components/resume/ResumePrintReadyFlag";

describe("ResumePrintReadyFlag", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "fonts");
    document.documentElement.removeAttribute("data-print-ready");
    document.documentElement.removeAttribute("data-resume-font-assets");
    document.documentElement.removeAttribute("data-resume-image-assets");
    window.__ANON_RESUME_PRINT_READY__ = false;
  });

  it("loads the requested fallback family before checking print readiness", async () => {
    let loaded = false;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        load: async () => {
          loaded = true;
        },
        check: () => loaded,
      },
    });
    render(
      <ResumePrintReadyFlag
        ready
        fontLoadFamily='"Primary", "Fallback", sans-serif'
      />,
    );

    await waitFor(() => expect(window.__ANON_RESUME_PRINT_READY__).toBe(true));
  });

  it("waits for image decoding before allowing PDF generation", async () => {
    let finishDecode!: () => void;
    const image = document.createElement("img");
    image.dataset.resumeImage = "true";
    image.decode = () =>
      new Promise<void>((resolve) => {
        finishDecode = resolve;
      });
    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: 600 },
    });
    document.body.append(image);
    try {
      render(<ResumePrintReadyFlag ready />);
      await waitFor(() => expect(finishDecode).toBeTypeOf("function"));
      expect(window.__ANON_RESUME_PRINT_READY__).toBe(false);
      finishDecode();
      await waitFor(() =>
        expect(window.__ANON_RESUME_PRINT_READY__).toBe(true),
      );
    } finally {
      image.remove();
    }
  });

  it("rejects incomplete images rather than producing an incomplete PDF", async () => {
    const image = document.createElement("img");
    image.dataset.resumeImage = "true";
    image.decode = () => Promise.reject(new Error("decode failed"));
    document.body.append(image);
    try {
      render(<ResumePrintReadyFlag ready />);
      await waitFor(() =>
        expect(document.documentElement).toHaveAttribute(
          "data-resume-image-assets",
          "error",
        ),
      );
      expect(window.__ANON_RESUME_PRINT_READY__).toBe(false);
    } finally {
      image.remove();
    }
  });

  it("does not report print readiness while font assets are loading", () => {
    render(<ResumePrintReadyFlag fontAssetStatus="loading" ready />);
    expect(window.__ANON_RESUME_PRINT_READY__).toBe(false);
    expect(document.documentElement).toHaveAttribute(
      "data-resume-font-assets",
      "loading",
    );
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
      expect(document.documentElement).toHaveAttribute(
        "data-resume-font-assets",
        "error",
      );
    });
    expect(window.__ANON_RESUME_PRINT_READY__).toBe(false);
  });
});
