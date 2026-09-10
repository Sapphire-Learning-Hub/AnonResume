import type { Metadata } from "next";

import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource-variable/lora/wght.css";
import "@fontsource-variable/manrope/wght.css";
import "@fontsource-variable/merriweather/wght.css";
import "@fontsource-variable/noto-sans-mono/wght.css";
import "@fontsource-variable/noto-sans-sc/wght.css";
import "@fontsource-variable/noto-serif-sc/wght.css";
import "@fontsource-variable/playfair-display/wght.css";
import "@fontsource-variable/source-sans-3/wght.css";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@fontsource/lxgw-marker-gothic/index.css";
import "@fontsource/lxgw-wenkai/500.css";

import "./globals.css";
import "@/styles/print.css";

import { I18nProvider } from "@/i18n/I18nProvider";
import { SystemStatePage } from "@/components/system/SystemStatePage";
import { GlobalFloatingActions } from "@/components/ui/GlobalFloatingActions";
import { getMessages } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/server";
import {
  resolveApplicationOriginForBootstrap,
  validateRuntimeConfiguration,
} from "@/lib/runtime/configuration";
import { UI_FONT_FAMILY } from "@/styles/ui-font";
import { AppThemeProvider } from "@/theme/AppThemeProvider";
import { getAppThemeCssVariables } from "@/theme/app-palette";
import { getRequestAppTheme } from "@/theme/server";

import StyleRegistry from "./StyleRegistry";

function getMetadataBase() {
  try {
    return new URL(resolveApplicationOriginForBootstrap(process.env));
  } catch {
    return new URL("http://localhost:3000");
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const configuration = validateRuntimeConfiguration(process.env);
  const locale = await getRequestLocale();
  const messages = getMessages(locale);

  return {
    metadataBase: getMetadataBase(),
    title: configuration.valid
      ? {
          default: "AnonResume",
          template: "%s | AnonResume",
        }
      : messages["system.configuration.documentTitle"],
    description: messages["home.metaDescription"],
    openGraph: {
      type: "website",
      siteName: "AnonResume",
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const configuration = validateRuntimeConfiguration(process.env);
  const [locale, initialTheme] = await Promise.all([
    getRequestLocale(),
    getRequestAppTheme(),
  ]);

  if (!configuration.valid) {
    console.error(
      `[AnonResume] Invalid production configuration: ${configuration.issues.join(", ")}`,
    );
    const messages = getMessages(locale);

    return (
      <html
        data-app-accent={initialTheme.accent}
        data-app-theme={initialTheme.resolvedMode}
        lang={locale}
        style={getAppThemeCssVariables(
          initialTheme.resolvedMode,
          initialTheme.accent,
        )}
      >
        <body style={{ fontFamily: UI_FONT_FAMILY }}>
          <SystemStatePage
            code="503"
            description={messages["system.configuration.description"]}
            title={messages["system.configuration.title"]}
          />
        </body>
      </html>
    );
  }

  return (
    <html
      data-app-accent={initialTheme.accent}
      data-app-theme={initialTheme.resolvedMode}
      lang={locale}
      style={getAppThemeCssVariables(
        initialTheme.resolvedMode,
        initialTheme.accent,
      )}
    >
      <body style={{ fontFamily: UI_FONT_FAMILY }}>
        <I18nProvider
          initialLocale={locale}
          initialMessages={getMessages(locale)}
        >
          <AppThemeProvider
            initialAccent={initialTheme.accent}
            initialMode={initialTheme.mode}
            initialResolvedMode={initialTheme.resolvedMode}
          >
            <StyleRegistry>
              {children}
              <GlobalFloatingActions />
            </StyleRegistry>
          </AppThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
