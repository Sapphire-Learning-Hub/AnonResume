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
    document.documentElement.removeAttribute("data-resume-image-assets");
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
        document.documentElement.removeAttribute(
          "data-resume-pagination-ready",
        );
        document.documentElement.removeAttribute("data-resume-font-assets");
        document.documentElement.removeAttribute("data-resume-image-assets");
      };
    }

    const markReady = async () => {
      try {
        // A fallback's default glyph may not occur in the document, so fonts.ready
        // alone does not guarantee that a subsequent family check will succeed.
        if (fontLoadFamily && typeof document.fonts?.load === "function") {
          await document.fonts.load(`16px ${fontLoadFamily}`);
          await document.fonts.ready;
        }
      } catch {
        if (!cancelled)
          document.documentElement.setAttribute(
            "data-resume-font-assets",
            "error",
          );
        return;
      }
      try {
        const images = Array.from(
          document.querySelectorAll<HTMLImageElement>(
            'img[data-resume-image="true"]',
          ),
        );
        await Promise.all(
          images.map(async (image) => {
            if (typeof image.decode === "function") await image.decode();
            if (!image.complete || image.naturalWidth === 0)
              throw new Error("image_decode_failed");
          }),
        );
      } catch {
        if (!cancelled)
          document.documentElement.setAttribute(
            "data-resume-image-assets",
            "error",
          );
        return;
      }
      if (cancelled || !ready) {
        return;
      }

      if (
        fontLoadFamily &&
        typeof document.fonts?.check === "function" &&
        !document.fonts.check(`16px ${fontLoadFamily}`)
      ) {
        document.documentElement.setAttribute(
          "data-resume-font-assets",
          "error",
        );
        return;
      }

      window.__ANON_RESUME_PRINT_READY__ = true;
      document.documentElement.setAttribute("data-print-ready", "true");
    };

    if (document.fonts?.ready) {
      void document.fonts.ready.then(markReady, () => {
        document.documentElement.setAttribute(
          "data-resume-font-assets",
          "error",
        );
      });

      return () => {
        cancelled = true;
        window.__ANON_RESUME_PRINT_READY__ = false;
        document.documentElement.removeAttribute("data-print-ready");
        document.documentElement.removeAttribute(
          "data-resume-pagination-ready",
        );
        document.documentElement.removeAttribute("data-resume-font-assets");
        document.documentElement.removeAttribute("data-resume-image-assets");
      };
    }

    markReady();

    return () => {
      cancelled = true;
      window.__ANON_RESUME_PRINT_READY__ = false;
      document.documentElement.removeAttribute("data-print-ready");
      document.documentElement.removeAttribute("data-resume-pagination-ready");
      document.documentElement.removeAttribute("data-resume-font-assets");
      document.documentElement.removeAttribute("data-resume-image-assets");
    };
  }, [fontAssetStatus, fontLoadFamily, ready]);

  return null;
}
