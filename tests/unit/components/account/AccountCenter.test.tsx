import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const feedbackMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));
const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: feedbackMocks }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));

import { AccountCenter } from "@/components/account/AccountCenter";

const profile = {
  email: "user@example.com",
  emailVerified: true,
  hasPassword: true,
  name: "Current User",
};
const sessions = [
  {
    id: "session-current",
    current: true,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-07T00:00:00.000Z",
    expiresAt: "2026-11-01T00:00:00.000Z",
    ipAddress: "127.0.0.1",
    device: {
      type: "desktop",
      vendor: "Apple",
      model: "Macintosh",
      os: { name: "macOS", version: "14.6", versionIsMinimum: false },
    },
  },
  {
    id: "session-other",
    current: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    expiresAt: "2026-11-01T00:00:00.000Z",
    ipAddress: "10.0.0.2",
    device: {
      type: "desktop",
      vendor: null,
      model: null,
      os: { name: "Windows", version: "10", versionIsMinimum: true },
    },
  },
];

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

describe("AccountCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account/profile" && !init?.method) {
        return jsonResponse({ profile });
      }
      if (url === "/api/account/sessions" && !init?.method) {
        return jsonResponse({ sessions });
      }
      return jsonResponse({ ok: true });
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the account shell and navigation visible while data is loading", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined));

    render(<AccountCenter />);

    expect(screen.getByRole("heading", { name: "账号中心" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "账号中心" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "个人资料" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录设备" })).toBeInTheDocument();
  });

  it("isolates a profile load failure from the sessions section", async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account/profile" && !init?.method) {
        return jsonResponse({ error: "unknown" }, 503);
      }
      if (url === "/api/account/sessions" && !init?.method) {
        return jsonResponse({ sessions });
      }
      return jsonResponse({ ok: true });
    });

    render(<AccountCenter />);

    expect(await screen.findByText("个人资料暂时无法加载。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载个人资料" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "登录设备" }));
    expect(await screen.findByText("Windows PC")).toBeInTheDocument();
    expect(feedbackMocks.error).not.toHaveBeenCalled();
  });

  it("retries a failed sessions request inside the sessions section", async () => {
    let sessionRequests = 0;
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account/profile" && !init?.method) {
        return jsonResponse({ profile });
      }
      if (url === "/api/account/sessions" && !init?.method) {
        sessionRequests += 1;
        return sessionRequests === 1
          ? jsonResponse({ error: "unknown" }, 503)
          : jsonResponse({ sessions });
      }
      return jsonResponse({ ok: true });
    });

    render(<AccountCenter />);
    await screen.findByDisplayValue("Current User");
    fireEvent.click(screen.getByRole("button", { name: "登录设备" }));

    expect(await screen.findByText("登录设备暂时无法加载。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新加载登录设备" }));

    expect(await screen.findByText("Windows PC")).toBeInTheDocument();
    expect(sessionRequests).toBe(2);
  });

  it("switches account sections from the embedded navigation", async () => {
    render(<AccountCenter />);
    await screen.findByDisplayValue("Current User");

    expect(screen.getByRole("heading", { name: "个人资料" })).toBeInTheDocument();
    expect(screen.queryByLabelText("当前密码")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "登录密码" }));

    expect(screen.getByRole("heading", { name: "登录密码" })).toBeInTheDocument();
    expect(screen.getByLabelText("当前密码")).toBeInTheDocument();
    expect(screen.queryByLabelText("显示名称")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "更换邮箱" }));

    expect(screen.getByRole("heading", { name: "更换邮箱" })).toBeInTheDocument();
    expect(screen.getByLabelText("当前密码")).toBeInTheDocument();
    expect(screen.queryByLabelText("新邮箱")).not.toBeInTheDocument();
  });

  it("updates the profile and password from dedicated sections", async () => {
    render(<AccountCenter />);
    expect(await screen.findByDisplayValue("Current User")).toBeInTheDocument();

    const name = screen.getByLabelText("显示名称");
    fireEvent.change(name, { target: { value: "Updated User" } });
    fireEvent.click(screen.getByRole("button", { name: "保存个人资料" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/profile",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Updated User" }),
      }),
    ));

    fireEvent.click(screen.getByRole("button", { name: "登录密码" }));

    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "new-password-123" },
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/password",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  it("runs the two-address verification flow before changing email", async () => {
    render(<AccountCenter />);
    await screen.findByDisplayValue("Current User");
    fireEvent.click(screen.getByRole("button", { name: "更换邮箱" }));

    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "old-password" },
    });
    expect(screen.queryByLabelText("当前邮箱验证码")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("新邮箱")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "验证密码并继续" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/email/challenge",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          stage: "old",
          currentPassword: "old-password",
          locale: "zh-CN",
        }),
      }),
    ));
    expect(await screen.findByLabelText("当前邮箱验证码")).toBeInTheDocument();
    expect(screen.queryByLabelText("新邮箱")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("当前邮箱验证码"), {
      target: { value: "111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证当前邮箱" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/email/challenge",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ code: "111111" }),
      }),
    ));
    expect(await screen.findByLabelText("新邮箱")).toBeInTheDocument();
    expect(screen.queryByLabelText("新邮箱验证码")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新邮箱"), {
      target: { value: "next@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送至新邮箱" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/email/challenge",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          stage: "new",
          newEmail: "next@example.com",
          oldEmailCode: "111111",
          locale: "zh-CN",
        }),
      }),
    ));
    expect(await screen.findByLabelText("新邮箱验证码")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("新邮箱验证码"), {
      target: { value: "222222" },
    });
    fireEvent.click(within(screen.getByRole("region", {
      name: "更换邮箱",
    })).getByRole("button", { name: "更换邮箱" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/email",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  it("revokes another session and exposes the read-only export", async () => {
    render(<AccountCenter />);
    await screen.findByDisplayValue("Current User");
    fireEvent.click(screen.getByRole("button", { name: "登录设备" }));
    expect(screen.getByText("Windows PC")).toBeInTheDocument();
    expect(screen.getByText("Windows 10 或更高版本")).toBeInTheDocument();

    const row = screen.getByText("Windows PC").closest("li");
    expect(row).toBeInstanceOf(HTMLElement);
    fireEvent.click(within(row as HTMLElement).getByRole("button", {
      name: "移除此设备",
    }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/sessions",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ sessionId: "session-other" }),
      }),
    ));
    fireEvent.click(screen.getByRole("button", { name: "其他" }));
    expect(screen.getByRole("link", { name: "导出个人数据" })).toHaveAttribute(
      "href",
      "/api/account/export?locale=zh-CN",
    );
    expect(screen.queryByText("下载仅供个人查阅的 Excel 文件，不能用于重新导入。")).not.toBeInTheDocument();
    expect(screen.queryByText("提交后进入 7 天冷静期，公开简历会立即停止发布。")).not.toBeInTheDocument();
  });

  it("requires a five-second warning before deletion verification", async () => {
    render(<AccountCenter />);
    await screen.findByDisplayValue("Current User");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "其他" }));
    fireEvent.click(screen.getByRole("button", { name: "申请注销账号" }));

    const warning = screen.getByRole("dialog", { name: "注销账号前请确认" });
    expect(warning).toHaveTextContent("申请注销后将进入 7 天冷静期");
    expect(within(warning).getByRole("button", { name: "5 秒后可继续" })).toBeDisabled();

    for (let second = 0; second < 5; second += 1) {
      await act(() => vi.advanceTimersByTimeAsync(1_000));
    }
    const continueButton = within(warning).getByRole("button", {
      name: "我已了解，继续",
    });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);

    const acknowledgement = screen.getByRole("checkbox", {
      name: "我已了解数据导出仅供个人查阅",
    });
    const dialog = acknowledgement.closest("[role='dialog']");
    expect(dialog).toBeInstanceOf(HTMLElement);
    vi.useRealTimers();
    expect(within(dialog as HTMLElement).queryByRole("link", {
      name: "导出个人数据",
    })).not.toBeInTheDocument();
    expect(within(dialog as HTMLElement).getByRole("button", { name: "发送验证码" })).toBeDisabled();

    fireEvent.click(acknowledgement);
    fireEvent.change(within(dialog as HTMLElement).getByLabelText("注销验证密码"), {
      target: { value: "old-password" },
    });
    fireEvent.click(within(dialog as HTMLElement).getByRole("button", { name: "发送验证码" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/deletion/challenge",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(within(dialog as HTMLElement).getByRole("button", {
      name: /60 秒后可重新发送/,
    })).toBeDisabled());
  });

  it("does not offer password-gated security actions to OAuth-only accounts", async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/account/profile") {
        return jsonResponse({ profile: { ...profile, hasPassword: false } });
      }
      if (url === "/api/account/sessions") return jsonResponse({ sessions });
      return jsonResponse({ ok: true });
    });

    render(<AccountCenter />);
    await screen.findByDisplayValue("Current User");

    fireEvent.click(screen.getByRole("button", { name: "登录密码" }));

    expect(screen.queryByRole("button", { name: "更新密码" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "更换邮箱" }));
    expect(screen.getByText("当前账号仅使用第三方登录，无法执行需要当前密码验证的操作。")).toBeInTheDocument();
    expect(screen.queryByLabelText("当前密码")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "其他" }));
    expect(screen.queryByRole("button", { name: "申请注销账号" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "导出个人数据" })).toBeInTheDocument();
  });

  it("shows a specific localized message for a known account error", async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/account/profile" && !init?.method) {
        return jsonResponse({ profile });
      }
      if (url === "/api/account/sessions" && !init?.method) {
        return jsonResponse({ sessions });
      }
      if (url === "/api/account/password") {
        return jsonResponse({ error: "password_incorrect" }, 400);
      }
      return jsonResponse({ ok: true });
    });

    render(<AccountCenter />);
    await screen.findByDisplayValue("Current User");
    fireEvent.click(screen.getByRole("button", { name: "登录密码" }));
    fireEvent.change(screen.getByLabelText("当前密码"), {
      target: { value: "wrong-password" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "new-password-123" },
    });
    fireEvent.change(screen.getByLabelText("确认新密码"), {
      target: { value: "new-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }));

    await waitFor(() => expect(feedbackMocks.error).toHaveBeenCalledWith({
      key: "account-action-error",
      content: "当前密码不正确。",
    }));
  });
});
