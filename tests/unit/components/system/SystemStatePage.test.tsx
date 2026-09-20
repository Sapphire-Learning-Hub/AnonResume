import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { SystemStatePage } from "@/components/system/SystemStatePage";
import { ConfigurationRuntimeStatusTable } from "@/components/system/ConfigurationRuntimeStatusTable";

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
    expect(screen.getByRole("img", { name: "AnonResume" })).toHaveAttribute(
      "loading",
      "eager",
    );
    expect(screen.getByRole("heading", { name: "页面暂时不可用" })).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.queryByText("系统状态")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("renders desired and loaded configuration state with a recovery action", () => {
    render(
      <ConfigurationRuntimeStatusTable
        locale="zh-CN"
        recoveryHref="/app/manage/configuration?history=1"
        states={[
          {
            consumer: "web",
            desiredVersion: 3,
            errorCode: null,
            fallbackVersion: null,
            instanceId: "web-1",
            lastSeenAt: new Date("2026-09-20T00:00:00.000Z"),
            loadedHotVersion: 3,
            loadedRestartVersion: 2,
            release: "v1.3.1",
            state: "pending_restart",
          },
          {
            consumer: "ai-worker",
            desiredVersion: 3,
            errorCode: "active_revision_unreadable",
            fallbackVersion: 2,
            instanceId: "ai-1",
            lastSeenAt: new Date("2026-09-20T00:00:30.000Z"),
            loadedHotVersion: 2,
            loadedRestartVersion: 2,
            release: "v1.3.1",
            state: "recovery_required",
          },
        ]}
        text={{
          consumer: "服务",
          desiredVersion: "期望版本",
          error: "错误代码",
          fallbackVersion: "回退版本",
          historyAction: "查看配置历史并准备回滚",
          hotVersion: "热更新版本",
          instance: "实例",
          lastSync: "最后同步",
          release: "版本",
          restartVersion: "重启配置版本",
          state: "状态",
          states: {
            current: "已同步",
            error: "错误",
            pending_restart: "等待重启",
            recovery_required: "需要恢复",
            stale: "已失联",
          },
          unknown: "未知",
        }}
      />,
    );

    expect(screen.getByText("等待重启")).toBeInTheDocument();
    expect(screen.getByText("需要恢复")).toBeInTheDocument();
    expect(screen.getByText("active_revision_unreadable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看配置历史并准备回滚" })).toHaveAttribute(
      "href",
      "/app/manage/configuration?history=1",
    );
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
