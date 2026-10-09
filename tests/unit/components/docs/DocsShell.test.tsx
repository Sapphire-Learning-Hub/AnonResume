import { fireEvent, render, screen, within } from "@testing-library/react";
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
  navigation: "文档导航",
  noResults: "没有匹配的文档",
  productArea: "公开简历",
  search: "搜索文档",
  signIn: "登录",
  siteTitle: "使用文档",
  superAdmin: "超级管理员",
  support: "获取支持",
  switchLocale: "切换文档语言",
};

const navigationGroups = [
  {
    id: "start",
    label: "开始使用",
    entries: [
      {
        href: "/docs",
        label: "文档首页",
        searchText: "开始 入门",
      },
      {
        href: "/docs/editor",
        label: "使用简历编辑器",
        searchText: "内容 保存 历史",
      },
    ],
  },
  {
    id: "support",
    label: "排障与支持",
    entries: [
      {
        href: "/docs/support",
        label: "获取支持",
        searchText: "反馈 联系",
      },
    ],
  },
];

interface TestViewer {
  destinationHref: string;
  email: string;
  managementOnly: boolean;
  name: string;
}

const TestableDocsShell = DocsShell as ComponentType<{
  children: ReactNode;
  labels: DocsShellLabels;
  navigationGroups: typeof navigationGroups;
  supportDestination: { external: boolean; href: string };
  viewer: TestViewer | null;
}>;

function renderShell(viewer: TestViewer | null) {
  return render(
    <ConfigProvider theme={appTheme}>
      <TestableDocsShell
        labels={labels}
        navigationGroups={navigationGroups}
        supportDestination={{ external: false, href: "/docs/support" }}
        viewer={viewer}
      >
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

  it("filters grouped navigation by localized search terms", () => {
    renderShell(null);

    expect(screen.getAllByText("开始使用")).not.toHaveLength(0);
    expect(screen.getAllByText("排障与支持")).not.toHaveLength(0);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索文档" }), {
      target: { value: "历史" },
    });

    expect(screen.getAllByRole("link", { name: "使用简历编辑器" }))
      .not.toHaveLength(0);
    expect(
      within(screen.getByRole("navigation", { name: "文档导航" })).queryByRole(
        "link",
        { name: "获取支持" },
      ),
    )
      .not.toBeInTheDocument();
  });

  it("marks an externally configured support destination", () => {
    render(
      <ConfigProvider theme={appTheme}>
        <TestableDocsShell
          labels={labels}
          navigationGroups={navigationGroups}
          supportDestination={{
            external: true,
            href: "https://support.example.com",
          }}
          viewer={null}
        >
          <p>文档内容</p>
        </TestableDocsShell>
      </ConfigProvider>,
    );

    const supportLinks = screen.getAllByRole("link", { name: /获取支持/ });
    expect(supportLinks[0]).toHaveAttribute(
      "href",
      "https://support.example.com",
    );
    expect(supportLinks[0]).toHaveAttribute(
      "target",
      "_blank",
    );
  });
});
