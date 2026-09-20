import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/components/admin/AdminOtpInput", () => ({
  AdminOtpInput: ({
    onChange,
    value,
    ...props
  }: {
    onChange: (value: string) => void;
    value: string;
    "aria-label": string;
  }) => (
    <input
      {...props}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  ),
}));

import { AdminSetupWizard } from "@/components/admin/setup/AdminSetupWizard";

describe("AdminSetupWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims the startup code before showing account fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse({ mode: "initialization" })),
    );
    render(<AdminSetupWizard initialMode="initialization" />);

    expect(
      screen.getByRole("heading", { name: "初始化 AnonResume" }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("初始化码"), {
      target: { value: "setup-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: /继\s*续/ }));

    expect(await screen.findByLabelText("邮箱")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      "/api/setup/claim",
      expect.objectContaining({ body: JSON.stringify({ code: "setup-code" }) }),
    );
  });

  it("clearly identifies administrator recovery mode", () => {
    render(<AdminSetupWizard initialMode="recovery" />);

    expect(
      screen.getByRole("heading", { name: "恢复超级管理员访问" }),
    ).toBeVisible();
    expect(screen.getByText(/保留原有账号和业务数据/)).toBeVisible();
  });

  it("shows MFA details, recovery actions, and navigates to sign in", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ mode: "initialization" }))
        .mockResolvedValueOnce(
          jsonResponse({
            email: "owner@example.com",
            deviceId: "4db73a13-640f-4385-8a29-b9fe053c28cb",
            secret: "FIRSTDEVICESECRET",
            uri: "otpauth://totp/AnonResume:owner%40example.com?secret=FIRSTDEVICESECRET",
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            email: "owner@example.com",
            recoveryCodes: ["AAAA-BBBB-CCCC-DDDD-EEEE"],
          }),
        ),
    );
    render(<AdminSetupWizard initialMode="initialization" />);

    change("初始化码", "setup-code");
    fireEvent.click(screen.getByRole("button", { name: /继\s*续/ }));
    await screen.findByLabelText("用户名");
    change("用户名", "Owner");
    change("邮箱", "owner@example.com");
    change("密码", "long-secure-password");
    change("确认密码", "long-secure-password");
    change("MFA 设备名称", "Primary");
    fireEvent.click(screen.getByRole("button", { name: "配置 MFA" }));

    expect(await screen.findByText("FIRSTDEVICESECRET")).toBeVisible();
    expect(screen.getByTitle("MFA 配置二维码").closest("svg")).toBeVisible();
    fireEvent.change(screen.getByLabelText("动态验证码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "完成初始化" }));

    expect(
      await screen.findByText("AAAA-BBBB-CCCC-DDDD-EEEE"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "下载恢复码" })).toBeVisible();
    expect(screen.getByRole("button", { name: "打印恢复码" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "前往登录" }));
    expect(router.replace).toHaveBeenCalledWith("/sign-in");
  });

  it("returns to code entry when a restart invalidates the session", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ mode: "initialization" }))
        .mockResolvedValueOnce(
          jsonResponse({ error: "setup_session_invalid" }, 401),
        ),
    );
    render(<AdminSetupWizard initialMode="initialization" />);

    change("初始化码", "setup-code");
    fireEvent.click(screen.getByRole("button", { name: /继\s*续/ }));
    await screen.findByLabelText("用户名");
    change("用户名", "Owner");
    change("邮箱", "owner@example.com");
    change("密码", "long-secure-password");
    change("确认密码", "long-secure-password");
    fireEvent.click(screen.getByRole("button", { name: "配置 MFA" }));

    expect(await screen.findByText(/服务可能已重启/)).toBeVisible();
    expect(screen.getByLabelText("初始化码")).toBeVisible();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
