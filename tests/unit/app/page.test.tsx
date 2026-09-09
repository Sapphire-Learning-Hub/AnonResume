import { render, screen } from "@testing-library/react";

import { I18nProvider } from "@/i18n/I18nProvider";
import { getMessages } from "@/i18n/messages";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the AnonResume foundation screen", () => {
    render(
      <I18nProvider
        initialLocale="zh-CN"
        initialMessages={getMessages("zh-CN")}
      >
        <HomePage />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "AnonResume", level: 1 })).toBeInTheDocument();
    expect(document.querySelector('img[src="/brand/anonresume-lockup.png"]')).toHaveAttribute(
      "alt",
      "AnonResume",
    );
    expect(document.querySelector('img[src="/brand/anonresume-lockup.png"]')).toHaveAttribute(
      "loading",
      "eager",
    );
    expect(screen.getAllByText("共享渲染器基础").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /登\s*录/ })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("shows the default resume document inside the foundation page", () => {
    render(
      <I18nProvider
        initialLocale="zh-CN"
        initialMessages={getMessages("zh-CN")}
      >
        <HomePage />
      </I18nProvider>,
    );

    expect(screen.getByText("个人简介")).toBeInTheDocument();
    expect(
      screen.getByText("基于流式布局的结构化简历编辑基础能力"),
    ).toBeInTheDocument();
  });
});
