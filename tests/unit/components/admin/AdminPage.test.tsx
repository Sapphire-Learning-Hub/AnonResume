import { render, screen } from "@testing-library/react";

import { AdminTable } from "@/components/admin/AdminPage";

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
  });
});
