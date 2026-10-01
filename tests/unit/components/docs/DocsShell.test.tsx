import { render, screen } from "@testing-library/react";
import { ConfigProvider } from "antd";
import type { ComponentType, ReactNode } from "react";

import {
  DocsShell,
  type DocsShellLabels,
} from "@/components/docs/DocsShell";
import { appTheme } from "@/styles/app-theme";

vi.mock("next/navigation", () => ({
  usePathname: () => "/docs",
}));

const labels: DocsShellLabels = {
  backHome: "返回首页",
  documentGuide: "文档指南",
  guideSection: "公开页面",
  home: "文档首页",
  navigation: "文档导航",
  noResults: "没有匹配的文档",
  productArea: "公开简历",
  publicAppearance: "公开简历外观",
  search: "搜索文档",
  signIn: "登录",
  siteTitle: "使用文档",
  superAdmin: "超级管理员",
  switchLocale: "切换文档语言",
};

interface TestViewer {
  destinationHref: string;
  email: string;
  managementOnly: boolean;
  name: string;
}

const TestableDocsShell = DocsShell as ComponentType<{
  children: ReactNode;
  labels: DocsShellLabels;
  viewer: TestViewer | null;
}>;

function renderShell(viewer: TestViewer | null) {
  return render(
    <ConfigProvider theme={appTheme}>
      <TestableDocsShell labels={labels} viewer={viewer}>
        <p>文档内容</p>
      </TestableDocsShell>
    </ConfigProvider>,
  );
}

describe("DocsShell", () => {
  it("shows a sign-in destination to anonymous readers", () => {
    renderShell(null);

    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("shows the management identity without offering the product workbench", () => {
    renderShell({
      destinationHref: "/app/manage",
      email: "admin@example.com",
      managementOnly: true,
      name: "平台管理员",
    });

    expect(
      screen.getByRole("link", {
        name: "平台管理员 admin@example.com 超级管理员",
      }),
    ).toHaveAttribute("href", "/app/manage");
    expect(screen.queryByRole("link", { name: "登录" })).not.toBeInTheDocument();
  });
});
