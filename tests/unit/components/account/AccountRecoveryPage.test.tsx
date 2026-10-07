import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn(), success: vi.fn() },
  }),
}));
vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => <button type="button">退出登录</button>,
}));

import { AccountRecoveryPage } from "@/components/account/AccountRecoveryPage";

describe("AccountRecoveryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
    )));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows the cooling deadline, export, recovery, and sign-out actions", () => {
    render(
      <AccountRecoveryPage
        deletionDueAt="2026-10-14T00:00:00.000Z"
        email="user@example.com"
      />,
    );

    expect(screen.getByRole("heading", { name: "账号注销冷静期" })).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "导出个人数据" })).toHaveAttribute(
      "href",
      "/api/account/export?locale=zh-CN",
    );
    expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
  });

  it("verifies the password and code before restoring access", async () => {
    render(
      <AccountRecoveryPage
        deletionDueAt="2026-10-14T00:00:00.000Z"
        email="user@example.com"
      />,
    );
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "old-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送恢复验证码" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/deletion/challenge",
      expect.objectContaining({ method: "POST" }),
    ));
    fireEvent.change(screen.getByLabelText("邮箱验证码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "撤销注销" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/deletion/recover",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(navigationMocks.push).toHaveBeenCalledWith("/app");
  });
});
