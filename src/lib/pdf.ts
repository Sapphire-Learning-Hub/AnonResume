import { chromium } from "playwright";

interface BrowserPage {
  goto: (
    url: string,
    options: {
      waitUntil: "networkidle";
    },
  ) => Promise<unknown>;
  waitForFunction: (
    pageFunction: (flagName: string) => boolean,
    arg: string,
  ) => Promise<unknown>;
  pdf: (options: {
    format: "A4";
    printBackground: boolean;
    preferCSSPageSize: boolean;
  }) => Promise<Uint8Array>;
  close: () => Promise<unknown>;
}

interface BrowserInstance {
  newPage: (options?: {
    extraHTTPHeaders?: Record<string, string>;
    storageState?: {
      cookies: PdfRequestCookie[];
      origins: [];
    };
  }) => Promise<BrowserPage>;
  close: () => Promise<unknown>;
}

export interface PdfRequestCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

export function createResumePdfExporter(params?: {
  launchBrowser?: () => Promise<BrowserInstance>;
}) {
  const launchBrowser =
    params?.launchBrowser ??
    (() =>
      chromium.launch({
        headless: true,
      }) as Promise<BrowserInstance>);

  return async function exportResumePdf(input: {
    printUrl: string;
    readyFlag: string;
    requestHeaders?: Record<string, string>;
    requestCookies?: PdfRequestCookie[];
    signal?: AbortSignal;
  }): Promise<Uint8Array> {
    const browser = await launchBrowser();
    const pageOptions =
      input.requestHeaders || input.requestCookies
        ? {
            ...(input.requestHeaders
              ? { extraHTTPHeaders: input.requestHeaders }
              : {}),
            ...(input.requestCookies
              ? {
                  storageState: {
                    cookies: input.requestCookies,
                    origins: [] as [],
                  },
                }
              : {}),
          }
        : undefined;
    const page = await browser.newPage(
      pageOptions,
    );
    let closePromise: Promise<void> | undefined;
    const closeResources = () => {
      closePromise ??= Promise.allSettled([page.close(), browser.close()]).then(
        () => undefined,
      );

      return closePromise;
    };
    const handleAbort = () => {
      void closeResources();
    };

    try {
      input.signal?.throwIfAborted();
      input.signal?.addEventListener("abort", handleAbort, { once: true });
      await page.goto(input.printUrl, { waitUntil: "networkidle" });
      await page.waitForFunction(
        (flagName) => window[flagName as keyof Window] === true,
        input.readyFlag,
      );

      return await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
    } finally {
      input.signal?.removeEventListener("abort", handleAbort);
      await closeResources();
    }
  };
}

export const exportResumePdf = createResumePdfExporter();
