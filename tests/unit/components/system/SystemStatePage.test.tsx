import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { SystemStatePage } from "@/components/system/SystemStatePage";

describe("SystemStatePage", () => {
  it("renders a branded status with an optional action", () => {
    const onAction = vi.fn();

    render(
      <SystemStatePage
        actionLabel="重试"
        code="500"
        description="请求处理失败，请稍后重试。"
        onAction={onAction}
        title="页面暂时不可用"
      />,
    );

    expect(screen.getByRole("img", { name: "AnonResume" })).toHaveAttribute(
      "src",
      "/brand/anonresume-lockup.png",
    );
    expect(screen.getByRole("heading", { name: "页面暂时不可用" })).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.queryByText("系统状态")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("can render a fully blocked state without interactive controls", () => {
    render(
      <SystemStatePage
        code="503"
        description="当前实例配置不正确，请联系管理员修复。"
        title="实例配置异常"
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("服务不可用")).not.toBeInTheDocument();
  });
});
