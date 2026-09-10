import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigProvider } from "antd";

import { appTheme } from "@/styles/app-theme";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { getMessages } from "@/i18n/messages";

function Probe() {
  const { locale, t } = useI18n();

  return (
    <>
      <div>{locale}</div>
      <div>{t("common.signIn")}</div>
      <div>{t("home.eyebrow")}</div>
    </>
  );
}

describe("I18nProvider", () => {
  it("defaults to Simplified Chinese messages and lets the user switch locales", async () => {
    render(
      <ConfigProvider theme={appTheme}>
        <I18nProvider
          initialLocale="zh-CN"
          initialMessages={getMessages("zh-CN")}
        >
          <LocaleSwitcher />
          <Probe />
        </I18nProvider>
      </ConfigProvider>,
    );

    expect(screen.getByText("zh-CN")).toBeInTheDocument();
    expect(screen.getByText("登录")).toBeInTheDocument();
    expect(screen.getByText("简单好用 · 随心排版 · 所见即所得")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开界面设置" }));
    expect(screen.getAllByText("界面设置")).toHaveLength(2);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("界面设置");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    const settingsLayout = screen
      .getByRole("dialog")
      .querySelector(".ant-modal-body > div");
    expect(settingsLayout).not.toBeNull();
    expect(window.getComputedStyle(settingsLayout!).minHeight).toBe("560px");
    const modalContainer = screen
      .getByRole("dialog")
      .querySelector(".ant-modal-container");
    expect(modalContainer).not.toBeNull();
    expect(window.getComputedStyle(modalContainer!).paddingLeft).toBe("0px");
    expect(screen.getByRole("dialog")).toHaveStyle({ width: "800px" });
    const languageSettingRow = screen.getByText("界面语言").parentElement
      ?.parentElement;
    expect(languageSettingRow).toBeTruthy();
    expect(
      window.getComputedStyle(languageSettingRow!).gridTemplateColumns,
    ).toBe("minmax(0, 1fr) auto");
    expect(screen.getByRole("button", { name: "常规" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "外观" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关于我们" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "常规" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "外观" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "外观" }));
    expect(screen.getByRole("button", { name: "外观" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("界面模式")).toBeInTheDocument();
    const themeModeControl = screen.getByRole("radiogroup", {
      name: "界面模式",
    });
    expect(themeModeControl).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /爱音粉/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "关于我们" }));
    expect(screen.getByText("关于 AnonResume")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "许可证" })).toHaveAttribute(
      "href",
      "/license",
    );
    expect(
      screen.getByRole("link", { name: "第三方声明" }),
    ).toHaveAttribute("href", "/third-party-notices");
    expect(
      screen.getAllByText("源代码").find((element) =>
        element.hasAttribute("aria-disabled"),
      ),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.mouseEnter(
      screen
        .getAllByText("源代码")
        .find((element) => element.hasAttribute("aria-disabled"))!,
    );
    expect(
      await screen.findByText("供应商未提供源代码访问"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "常规" }));

    fireEvent.click(screen.getByRole("radio", { name: "English" }));

    expect(screen.getByText("en-US")).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText("Easy to use · Flexible design · True preview")).toBeInTheDocument();
    expect(screen.getAllByText("Interface Settings")).toHaveLength(2);
  });
});
