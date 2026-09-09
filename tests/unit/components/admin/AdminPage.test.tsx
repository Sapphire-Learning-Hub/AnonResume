import { render, screen } from "@testing-library/react";

import {
  AdminIdentity,
  AdminMetric,
  AdminMetricGrid,
  AdminPage,
  AdminSection,
  AdminStatus,
  AdminTable,
  AdminTableActions,
  AdminToolbar,
} from "@/components/admin/AdminPage";

describe("AdminPage primitives", () => {
  it("uses one shared page, toolbar, section, and metric structure", () => {
    const { container } = render(
      <AdminPage actions={<button type="button">新增</button>} title="用户">
        <AdminToolbar meta="共 12 项">
          <button type="button">筛选</button>
        </AdminToolbar>
        <AdminMetricGrid>
          <AdminMetric label="用户" value={12} />
        </AdminMetricGrid>
        <AdminSection actions={<button type="button">刷新</button>} title="最近用户">
          内容
        </AdminSection>
      </AdminPage>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "用户" })).toBeInTheDocument();
    expect(container.querySelector(".admin-page-header__actions")).not.toBeNull();
    expect(container.querySelector(".admin-toolbar__meta")).toHaveTextContent("共 12 项");
    expect(container.querySelector(".admin-metric-grid")).not.toBeNull();
    expect(container.querySelector(".admin-section__header")).not.toBeNull();
  });

  it("renders consistent identity and status content", () => {
    render(
      <>
        <AdminIdentity description="owner@example.com" title="Owner" />
        <AdminStatus tone="success">正常</AdminStatus>
      </>,
    );

    expect(screen.getByText("Owner")).toHaveClass("admin-identity__title");
    expect(screen.getByText("owner@example.com")).toHaveClass(
      "admin-identity__description",
    );
    expect(screen.getByText("正常")).toHaveAttribute("data-tone", "success");
  });

  it("uses one shared action container for management table controls", () => {
    render(
      <AdminTableActions>
        <button type="button">详情</button>
        <button type="button">删除</button>
      </AdminTableActions>,
    );

    expect(screen.getByRole("button", { name: "详情" }).parentElement).toHaveClass(
      "admin-table-actions",
    );
    expect(screen.getByRole("button", { name: "删除" }).parentElement).toHaveClass(
      "admin-table-actions",
    );
  });
});

describe("AdminTable", () => {
  it("renders URL-preserving numbered pagination", () => {
    render(
      <AdminTable
        headers={["Name"]}
        pagination={{
          basePath: "/app/manage/users",
          page: 2,
          pageSize: 20,
          searchParams: { q: "alice", page: "2" },
          total: 41,
          totalPages: 3,
        }}
        rows={[["Alice"]]}
      />,
    );

    expect(screen.getByRole("navigation", { name: "分页导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "第 3 页" })).toHaveAttribute(
      "href",
      "/app/manage/users?q=alice&page=3",
    );
    expect(screen.getByRole("cell", { name: "Alice" })).toHaveAttribute(
      "data-label",
      "Name",
    );
  });

  it("only applies compact action styling when the table declares an action column", () => {
    const { rerender } = render(
      <AdminTable headers={["名称", "更新时间"]} rows={[["简历", "今天"]]} />,
    );

    expect(screen.getByRole("cell", { name: "今天" })).not.toHaveClass(
      "admin-table__actions",
    );

    rerender(
      <AdminTable
        actionColumn
        headers={["名称", "操作"]}
        rows={[["简历", "编辑"]]}
      />,
    );

    expect(screen.getByRole("cell", { name: "编辑" })).toHaveClass(
      "admin-table__actions",
    );
    expect(screen.getByRole("columnheader", { name: "操作" })).toHaveClass(
      "admin-table__actions",
    );
  });
});
