import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import AppError from "@/app/error";
import NotFound from "@/app/not-found";
import ConfigurationErrorPage from "@/app/configuration-error/page";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getMessages } from "@/i18n/messages";

vi.mock("@/i18n/server", () => ({
  getRequestMessages: () => Promise.resolve(getMessages("zh-CN")),
}));

describe("application status pages", () => {
  it("renders the blocked configuration state when production settings are invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");

    render(await ConfigurationErrorPage());

    expect(screen.getByText("503")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "实例配置异常" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    vi.unstubAllEnvs();
  });

  it("renders a branded 404 with a workbench action", async () => {
    render(await NotFound());

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "页面不存在" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回工作台" })).toHaveAttribute(
      "href",
      "/app",
    );
  });

  it("allows a route error to retry", () => {
    const retry = vi.fn();

    render(
      <I18nProvider
        initialLocale="zh-CN"
        initialMessages={getMessages("zh-CN")}
      >
        <AppError error={new Error("private detail")} retry={retry} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "页面暂时不可用" })).toBeInTheDocument();
    expect(document.title).toBe("页面暂时不可用 | AnonResume");
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
