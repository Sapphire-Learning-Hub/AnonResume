import { render, screen } from "@testing-library/react";

import { I18nProvider } from "@/i18n/I18nProvider";
import { getMessages } from "@/i18n/messages";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("presents the product and primary conversion path", () => {
    render(
      <I18nProvider
        initialLocale="zh-CN"
        initialMessages={getMessages("zh-CN")}
      >
        <HomePage />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: "让每段经历，以专业方式被看见",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(document.querySelector('img[src="/brand/anonresume-lockup.png"]')).toHaveAttribute(
      "alt",
      "AnonResume",
    );
    expect(document.querySelector('img[src="/brand/anonresume-lockup.png"]')).toHaveAttribute(
      "loading",
      "eager",
    );
    expect(screen.getByRole("navigation", { name: "首页导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "看看它能做什么" })).toHaveAttribute(
      "href",
      "#features",
    );
    expect(screen.getAllByRole("link", { name: "开始制作" })[0]).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("uses responsive product imagery and describes supported capabilities", () => {
    render(
      <I18nProvider
        initialLocale="zh-CN"
        initialMessages={getMessages("zh-CN")}
      >
        <HomePage />
      </I18nProvider>,
    );

    const editorImage = screen.getByRole("img", {
      name: "AnonResume 简历编辑器界面",
    });

    expect(editorImage).toHaveAttribute(
      "sizes",
      "(max-width: 768px) 94vw, (max-width: 1200px) 88vw, 1120px",
    );
    expect(screen.getByText("像写文档一样编辑简历")).toBeInTheDocument();
    expect(screen.getByText("Markdown 导入")).toBeInTheDocument();
    expect(screen.getByText("改过什么，一眼看清")).toBeInTheDocument();
    expect(screen.getByText("发布与 PDF 导出")).toBeInTheDocument();
  });
});
