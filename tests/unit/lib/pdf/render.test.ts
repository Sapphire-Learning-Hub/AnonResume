import { describe, expect, it, vi } from "vitest";

import { createResumePdfExporter } from "@/lib/pdf/render";

describe("createResumePdfExporter", () => {
  it("opens the print route, waits for readiness, and returns pdf bytes", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForFunction = vi.fn().mockResolvedValue(undefined);
    const pdf = vi.fn().mockResolvedValue(new Uint8Array([9, 8, 7]));
    const closePage = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue({
      goto,
      waitForFunction,
      pdf,
      close: closePage,
    });
    const launchBrowser = vi.fn().mockResolvedValue({
      newPage,
      close: closeBrowser,
    });

    const exportResumePdf = createResumePdfExporter({ launchBrowser });
    const result = await exportResumePdf({
      printUrl: "http://127.0.0.1:3000/app/resumes/resume-foundation/print",
      readyFlag: "__ANON_RESUME_PRINT_READY__",
    });

    expect(launchBrowser).toHaveBeenCalledTimes(1);
    expect(newPage).toHaveBeenCalledWith(undefined);
    expect(goto).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/app/resumes/resume-foundation/print",
      { waitUntil: "networkidle" },
    );
    expect(waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      "__ANON_RESUME_PRINT_READY__",
    );
    expect(pdf).toHaveBeenCalledWith({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    expect(closePage).toHaveBeenCalledTimes(1);
    expect(closeBrowser).toHaveBeenCalledTimes(1);
    expect(result).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("forwards request headers when opening the protected print route", async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const waitForFunction = vi.fn().mockResolvedValue(undefined);
    const pdf = vi.fn().mockResolvedValue(new Uint8Array([9, 8, 7]));
    const closePage = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const newPage = vi.fn().mockResolvedValue({
      goto,
      waitForFunction,
      pdf,
      close: closePage,
    });
    const launchBrowser = vi.fn().mockResolvedValue({
      newPage,
      close: closeBrowser,
    });

    const exportResumePdf = createResumePdfExporter({ launchBrowser });

    await exportResumePdf({
      printUrl: "http://localhost:3000/app/resumes/resume-foundation/print",
      readyFlag: "__ANON_RESUME_PRINT_READY__",
      requestHeaders: {
        cookie: "better-auth.session_token=demo-session",
      },
    });

    expect(newPage).toHaveBeenCalledWith({
      extraHTTPHeaders: {
        cookie: "better-auth.session_token=demo-session",
      },
    });
  });

  it("scopes worker authorization cookies to the application print path", async () => {
    const newPage = vi.fn().mockResolvedValue({
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockResolvedValue(new Uint8Array([1])),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const exportResumePdf = createResumePdfExporter({
      launchBrowser: vi.fn().mockResolvedValue({
        newPage,
        close: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const cookie = {
      name: "anonresume_pdf_worker",
      value: "worker-token",
      domain: "resume.example.com",
      path: "/pdf-export/",
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: "Strict" as const,
    };

    await exportResumePdf({
      printUrl: "https://resume.example.com/pdf-export/job/print",
      readyFlag: "__ANON_RESUME_PRINT_READY__",
      requestCookies: [cookie],
    });

    expect(newPage).toHaveBeenCalledWith({
      storageState: { cookies: [cookie], origins: [] },
    });
  });

  it("closes Chromium when a running export is cancelled", async () => {
    const controller = new AbortController();
    const closePage = vi.fn().mockResolvedValue(undefined);
    const closeBrowser = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const launchBrowser = vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto,
        waitForFunction: vi.fn(),
        pdf: vi.fn(),
        close: closePage,
      }),
      close: closeBrowser,
    });
    const exportResumePdf = createResumePdfExporter({ launchBrowser });
    const exporting = exportResumePdf({
      printUrl: "http://localhost:3000/pdf-export/job/print",
      readyFlag: "__ANON_RESUME_PRINT_READY__",
      signal: controller.signal,
    });

    await vi.waitFor(() => expect(goto).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(exporting).rejects.toMatchObject({ name: "AbortError" });
    expect(closePage).toHaveBeenCalledTimes(1);
    expect(closeBrowser).toHaveBeenCalledTimes(1);
  });
});
