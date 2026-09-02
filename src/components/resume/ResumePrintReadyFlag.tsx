"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __ANON_RESUME_PRINT_READY__?: boolean;
  }
}

export function ResumePrintReadyFlag({ ready }: { ready: boolean }) {
  useEffect(() => {
    let cancelled = false;

    window.__ANON_RESUME_PRINT_READY__ = false;
    document.documentElement.setAttribute(
      "data-resume-pagination-ready",
      ready ? "true" : "false",
    );
    document.documentElement.setAttribute("data-print-ready", "false");

    if (!ready) {
      return () => {
        cancelled = true;
        window.__ANON_RESUME_PRINT_READY__ = false;
        document.documentElement.removeAttribute("data-print-ready");
        document.documentElement.removeAttribute("data-resume-pagination-ready");
      };
    }

    const markReady = () => {
      if (cancelled || !ready) {
        return;
      }

      window.__ANON_RESUME_PRINT_READY__ = true;
      document.documentElement.setAttribute("data-print-ready", "true");
    };

    if (document.fonts?.ready) {
      void document.fonts.ready.then(markReady, markReady);

      return () => {
        cancelled = true;
        window.__ANON_RESUME_PRINT_READY__ = false;
        document.documentElement.removeAttribute("data-print-ready");
        document.documentElement.removeAttribute("data-resume-pagination-ready");
      };
    }

    markReady();

    return () => {
      cancelled = true;
      window.__ANON_RESUME_PRINT_READY__ = false;
      document.documentElement.removeAttribute("data-print-ready");
      document.documentElement.removeAttribute("data-resume-pagination-ready");
    };
  }, [ready]);

  return null;
}
