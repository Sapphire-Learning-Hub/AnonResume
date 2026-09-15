import { fireEvent, render, screen } from "@testing-library/react";

import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { getMessages } from "@/i18n/messages";

function LocaleProbe() {
  const { locale, setLocale, t } = useI18n();

  return (
    <button type="button" onClick={() => setLocale("en-US")}>
      {locale}:{t("common.signIn")}
    </button>
  );
}

describe("I18nProvider", () => {
  it("switches the active message set and persists the selected locale", () => {
    render(
      <I18nProvider
        initialLocale="zh-CN"
        initialMessages={getMessages("zh-CN")}
      >
        <LocaleProbe />
      </I18nProvider>,
    );

    const switchLocale = screen.getByRole("button", { name: "zh-CN:登录" });
    fireEvent.click(switchLocale);

    expect(
      screen.getByRole("button", { name: "en-US:Sign In" }),
    ).toBeInTheDocument();
    expect(document.cookie).toContain("anonresume-locale=en-US");
  });
});
