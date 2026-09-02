"use client";

import { useEffect } from "react";

import { SystemStatePage } from "@/components/system/SystemStatePage";
import { defaultLocale, getMessages } from "@/i18n/messages";
import { UI_FONT_FAMILY } from "@/styles/ui-font";
import { getAppThemeCssVariables } from "@/theme/app-palette";

import "./globals.css";

const messages = getMessages(defaultLocale);

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[AnonResume] Root rendering failed", {
      digest: error.digest,
    });
  }, [error.digest]);

  return (
    <html
      data-app-accent="anon"
      data-app-theme="light"
      lang={defaultLocale}
      style={getAppThemeCssVariables("light", "anon")}
    >
      <body style={{ fontFamily: UI_FONT_FAMILY }}>
        <title>{messages["system.globalError.documentTitle"]}</title>
        <SystemStatePage
          actionLabel={messages["system.error.retry"]}
          code="500"
          description={messages["system.globalError.description"]}
          onAction={retry}
          title={messages["system.globalError.title"]}
        />
      </body>
    </html>
  );
}
