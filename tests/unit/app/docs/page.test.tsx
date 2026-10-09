import { fireEvent, render, screen, within } from "@testing-library/react";

import DocsLayout from "@/app/docs/layout";
import DocsPage from "@/app/docs/page";
import AiAssistantPage from "@/app/docs/ai-assistant/page";
import PublicResumeCustomizationPage from "@/app/docs/public-resume-customization/page";

const navigationState = vi.hoisted(() => ({ pathname: "/docs" }));
const docsViewerState = vi.hoisted(() => ({
  viewer: null as null | {
    destinationHref: "/app" | "/app/manage";
    email: string;
    managementOnly: boolean;
    name: string;
  },
}));
const runtimeState = vi.hoisted(() => ({
  aiEnabled: false,
  supportUrl: "",
}));
const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMocks.redirect,
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/components/docs/PublicResumeUrlBuilder", () => ({
  PublicResumeUrlBuilder: ({ viewerMode }: { viewerMode: string }) => (
    <section>URL builder: {viewerMode}</section>
  ),
}));

vi.mock("@/lib/auth/docs-context", () => ({
  getDocsViewerContext: () => Promise.resolve(docsViewerState.viewer),
}));

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: () => Promise.resolve({
    values: {
      aiEnabled: runtimeState.aiEnabled,
      privacyPolicyUrl: "",
      supportUrl: runtimeState.supportUrl,
      termsOfServiceUrl: "",
    },
  }),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn(), success: vi.fn() },
  }),
}));

describe("documentation routes", () => {
  beforeEach(() => {
    navigationState.pathname = "/docs";
    docsViewerState.viewer = null;
    runtimeState.aiEnabled = false;
    runtimeState.supportUrl = "";
    navigationMocks.redirect.mockClear();
  });

  it("uses the management-only documentation state for a super administrator", async () => {
    navigationState.pathname = "/docs/public-resume-customization";
    docsViewerState.viewer = {
      destinationHref: "/app/manage",
      email: "admin@example.com",
      managementOnly: true,
      name: "平台管理员",
    };

    render(
      await DocsLayout({
        children: await PublicResumeCustomizationPage(),
      }),
    );

    expect(
      screen.getByRole("link", {
        name: "平台管理员 admin@example.com 超级管理员",
      }),
    ).toHaveAttribute("href", "/app/manage");
    expect(screen.getByText("URL builder: super-admin")).toBeInTheDocument();
  });

  it("renders the public documentation index with accessible navigation", async () => {
    render(await DocsLayout({ children: await DocsPage() }));

    expect(
      screen.getByRole("heading", { level: 1, name: "AnonResume 使用指南" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "文档导航" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("帮助中心")).not.toHaveLength(0);
    expect(screen.getByText("产品帮助")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "搜索文档" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "文档首页" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "公开简历外观" }),
    ).toHaveAttribute("href", "/docs/public-resume-customization");
    expect(
      screen.getByRole("navigation", { name: "面包屑" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "本页内容" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "复制全文" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /下一篇.*使用简历编辑器/ }))
      .toHaveAttribute("href", "/docs/editor");
    expect(
      screen.getAllByRole("link", { name: "使用简历编辑器" }),
    ).not.toHaveLength(0);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索文档" }), {
      target: { value: "不存在" },
    });
    expect(screen.getAllByText("没有匹配的文档")).not.toHaveLength(0);
  });

  it("only exposes AI help when the platform enables AI", async () => {
    runtimeState.aiEnabled = true;
    const { unmount } = render(await DocsLayout({ children: await DocsPage() }));

    expect(screen.getByRole("link", { name: "使用 AI 助手" })).toHaveAttribute(
      "href",
      "/docs/ai-assistant",
    );
    unmount();

    runtimeState.aiEnabled = false;
    render(await DocsLayout({ children: await DocsPage() }));
    expect(screen.queryByRole("link", { name: "使用 AI 助手" }))
      .not.toBeInTheDocument();
  });

  it("redirects the AI guide when AI is disabled", async () => {
    runtimeState.aiEnabled = false;

    await expect(AiAssistantPage()).rejects.toThrow("redirect:/docs");
    expect(navigationMocks.redirect).toHaveBeenCalledWith("/docs");
  });

  it("renders the AI guide when AI is enabled", async () => {
    runtimeState.aiEnabled = true;
    navigationState.pathname = "/docs/ai-assistant";

    render(
      await DocsLayout({
        children: await AiAssistantPage(),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "使用 AI 助手" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "使用 AI 助手" }))
      .toHaveAttribute("aria-current", "page");
  });

  it("generates the complete public appearance parameter reference", async () => {
    navigationState.pathname = "/docs/public-resume-customization";
    render(
      await DocsLayout({
        children: await PublicResumeCustomizationPage(),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "自定义公开简历外观" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "公开简历外观" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "创建分享链接" }),
    ).toHaveAttribute("href", "#url-builder-title");
    expect(
      screen.getByRole("link", { name: /上一篇.*导入、发布与导出/ }),
    ).toHaveAttribute("href", "/docs/import-export");
    const advancedReference = screen
      .getByText("高级参数")
      .closest("details");
    expect(advancedReference).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("高级参数"));
    expect(advancedReference).toHaveAttribute("open");
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "用途与可用值" }),
    ).toBeInTheDocument();

    const headerRow = within(table).getByText("view-header").closest("tr");
    expect(headerRow).not.toBeNull();
    expect(within(headerRow!).getByText("控制页面顶部显示哪些信息。"))
      .toBeInTheDocument();
    expect(
      within(headerRow!).getAllByText(/显示标题和操作按钮/),
    ).not.toHaveLength(0);
    expect(
      within(headerRow!).getByText(/只显示标题，不显示操作按钮/),
    ).toBeInTheDocument();
    expect(
      within(headerRow!).getByText(/隐藏整个顶部区域/),
    ).toBeInTheDocument();
    const headerDefaultCell = within(headerRow!).getAllByRole("cell")[2];
    expect(within(headerDefaultCell).getByText("full")).toBeInTheDocument();
    expect(
      within(headerDefaultCell).queryByText(/显示标题和操作按钮/),
    ).not.toBeInTheDocument();

    const backgroundRow = within(table)
      .getByText("view-background")
      .closest("tr");
    expect(backgroundRow).not.toBeNull();
    expect(within(backgroundRow!).getByText(/六位颜色值.*FFFFFF/))
      .toBeInTheDocument();

    const widthRow = within(table).getByText("view-width").closest("tr");
    expect(widthRow).not.toBeNull();
    expect(within(widthRow!).getByText(/640–1440 px/)).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(12);
  });
});
