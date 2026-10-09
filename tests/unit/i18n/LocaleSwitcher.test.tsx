import { fireEvent, render, screen } from "@testing-library/react";

import {
  PublicRuntimeConfigProvider,
  type PublicRuntimeConfig,
} from "@/components/config/PublicRuntimeConfigProvider";
import { I18nProvider } from "@/i18n/I18nProvider";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { getMessages } from "@/i18n/messages";
import { AppThemeProvider } from "@/theme/AppThemeProvider";

function renderSwitcher(configuration: PublicRuntimeConfig) {
  render(
    <PublicRuntimeConfigProvider value={configuration}>
      <I18nProvider
        initialLocale="zh-CN"
        initialMessages={getMessages("zh-CN")}
      >
        <AppThemeProvider
          initialAccent="anon"
          initialMode="light"
          initialResolvedMode="light"
        >
          <LocaleSwitcher />
        </AppThemeProvider>
      </I18nProvider>
    </PublicRuntimeConfigProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "打开界面设置" }));
  fireEvent.click(screen.getByRole("button", { name: "关于我们" }));
}

function configuration(
  overrides: Partial<PublicRuntimeConfig> = {},
): PublicRuntimeConfig {
  return {
    aiEnabled: false,
    configurationHealth: "healthy",
    privacyPolicyUrl: "",
    sourceCodeUrl: "",
    supportUrl: "",
    termsOfServiceUrl: "",
    ...overrides,
  };
}

describe("LocaleSwitcher", () => {
  it("links to the built-in privacy policy and terms from the about section", () => {
    renderSwitcher(configuration());

    expect(screen.getByRole("link", { name: "隐私政策" }))
      .toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "服务条款" }))
      .toHaveAttribute("href", "/terms");
  });

  it("uses configured external legal destinations from the about section", () => {
    renderSwitcher(
      configuration({
        privacyPolicyUrl: "https://legal.example.com/privacy",
        termsOfServiceUrl: "https://legal.example.com/terms",
      }),
    );

    expect(screen.getByRole("link", { name: "隐私政策" }))
      .toHaveAttribute("href", "https://legal.example.com/privacy");
    expect(screen.getByRole("link", { name: "隐私政策" }))
      .toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "服务条款" }))
      .toHaveAttribute("href", "https://legal.example.com/terms");
    expect(screen.getByRole("link", { name: "服务条款" }))
      .toHaveAttribute("target", "_blank");
  });
});
