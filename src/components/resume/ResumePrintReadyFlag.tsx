"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __ANON_RESUME_PRINT_READY__?: boolean;
  }
}

export function ResumePrintReadyFlag({
  ready,
  fontAssetStatus = "ready",
  fontLoadFamily,
}: {
  ready: boolean;
  fontAssetStatus?: "idle" | "loading" | "ready" | "error";
  fontLoadFamily?: string;
}) {
  useEffect(() => {
    let cancelled = false;

    window.__ANON_RESUME_PRINT_READY__ = false;
    document.documentElement.setAttribute(
      "data-resume-pagination-ready",
      ready ? "true" : "false",
    );
    document.documentElement.setAttribute("data-print-ready", "false");
    document.documentElement.setAttribute(
      "data-resume-font-assets",
      fontAssetStatus,
    );

    if (!ready || fontAssetStatus !== "ready") {
      return () => {
        cancelled = true;
        window.__ANON_RESUME_PRINT_READY__ = false;
        document.documentElement.removeAttribute("data-print-ready");
        document.documentElement.removeAttribute("data-resume-pagination-ready");
        document.documentElement.removeAttribute("data-resume-font-assets");
      };
    }

    const markReady = () => {
      if (cancelled || !ready) {
        return;
      }

      if (
        fontLoadFamily &&
        typeof document.fonts?.check === "function" &&
        !document.fonts.check(`16px ${fontLoadFamily}`)
      ) {
        document.documentElement.setAttribute("data-resume-font-assets", "error");
        return;
      }

      window.__ANON_RESUME_PRINT_READY__ = true;
      document.documentElement.setAttribute("data-print-ready", "true");
    };

    if (document.fonts?.ready) {
      void document.fonts.ready.then(markReady, () => {
        document.documentElement.setAttribute("data-resume-font-assets", "error");
      });

      return () => {
        cancelled = true;
        window.__ANON_RESUME_PRINT_READY__ = false;
        document.documentElement.removeAttribute("data-print-ready");
        document.documentElement.removeAttribute("data-resume-pagination-ready");
        document.documentElement.removeAttribute("data-resume-font-assets");
      };
    }

    markReady();

    return () => {
      cancelled = true;
      window.__ANON_RESUME_PRINT_READY__ = false;
      document.documentElement.removeAttribute("data-print-ready");
      document.documentElement.removeAttribute("data-resume-pagination-ready");
      document.documentElement.removeAttribute("data-resume-font-assets");
    };
  }, [fontAssetStatus, fontLoadFamily, ready]);

  return null;
}
