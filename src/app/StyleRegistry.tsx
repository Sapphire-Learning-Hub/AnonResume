"use client";

import type { PropsWithChildren } from "react";

import { App as AntdApp, ConfigProvider } from "antd";
import { StyleProvider, extractStaticStyle } from "antd-style";
import { useServerInsertedHTML } from "next/navigation";

import { useI18n } from "@/i18n/I18nProvider";
import { getAntdLocale } from "@/i18n/antd-locale";
import { getAppTheme } from "@/styles/app-theme";
import { useAppTheme } from "@/theme/AppThemeProvider";

export default function StyleRegistry({ children }: PropsWithChildren) {
  const { locale } = useI18n();
  const { resolvedMode, accent } = useAppTheme();

  useServerInsertedHTML(() =>
    extractStaticStyle().map((style) => style.style),
  );

  return (
    // Keep component-scoped overrides stable if Ant Design reinserts styles during hydration.
    <StyleProvider cache={extractStaticStyle.cache} hashPriority="low">
      <ConfigProvider
        locale={getAntdLocale(locale)}
        theme={getAppTheme(resolvedMode, accent)}
      >
        <AntdApp
          component={false}
          message={{ duration: 3, maxCount: 3, pauseOnHover: true }}
          notification={{
            duration: 5,
            maxCount: 4,
            pauseOnHover: true,
            placement: "topRight",
            stack: { threshold: 3 },
          }}
        >
          {children}
        </AntdApp>
      </ConfigProvider>
    </StyleProvider>
  );
}
