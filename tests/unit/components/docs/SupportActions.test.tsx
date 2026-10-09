import { render, screen } from "@testing-library/react";

import { SupportActions } from "@/components/docs/SupportActions";

const labels = {
  contactAdministrator: "请联系当前实例的管理员。",
  openSupport: "提交反馈",
  troubleshooting: "查看常见问题",
};

describe("SupportActions", () => {
  it("offers the configured external support channel", () => {
    render(
      <SupportActions
        destination={{
          external: true,
          href: "https://support.example.com/tickets",
        }}
        labels={labels}
      />,
    );

    expect(screen.getByRole("link", { name: "提交反馈" })).toHaveAttribute(
      "href",
      "https://support.example.com/tickets",
    );
    expect(screen.getByRole("link", { name: "提交反馈" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.queryByText("请联系当前实例的管理员。"))
      .not.toBeInTheDocument();
  });

  it("does not render an empty or self-referencing support action", () => {
    render(
      <SupportActions
        destination={{ external: false, href: "/docs/support" }}
        labels={labels}
      />,
    );

    expect(screen.queryByRole("link", { name: "提交反馈" }))
      .not.toBeInTheDocument();
    expect(screen.getByText("请联系当前实例的管理员。"))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看常见问题" }))
      .toHaveAttribute("href", "/docs/troubleshooting");
  });
});
