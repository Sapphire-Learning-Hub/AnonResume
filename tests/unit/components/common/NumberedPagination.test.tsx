import { render, screen } from "@testing-library/react";

import { NumberedPagination } from "@/components/common/NumberedPagination";

describe("NumberedPagination", () => {
  it("preserves filters while replacing its own page parameter", () => {
    render(
      <NumberedPagination
        basePath="/app/manage/roles"
        page={2}
        pageParam="rolePage"
        pageSize={20}
        searchParams={{ adminPage: "3", q: "support", rolePage: "2" }}
        total={81}
        totalPages={5}
      />,
    );

    expect(screen.getByRole("navigation", { name: "分页导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "上一页" })).toHaveAttribute(
      "href",
      "/app/manage/roles?adminPage=3&q=support&rolePage=1",
    );
    expect(screen.getByRole("link", { name: "第 3 页" })).toHaveAttribute(
      "href",
      "/app/manage/roles?adminPage=3&q=support&rolePage=3",
    );
    expect(screen.getByText("共 81 条")).toBeInTheDocument();
  });

  it("does not render for a single page", () => {
    const { container } = render(
      <NumberedPagination
        basePath="/app"
        page={1}
        pageSize={20}
        searchParams={{}}
        total={8}
        totalPages={1}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
