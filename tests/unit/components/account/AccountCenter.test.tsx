import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
    userAgent: "Current browser",
  },
  {
    id: "session-other",
    current: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    expiresAt: "2026-11-01T00:00:00.000Z",
    ipAddress: "10.0.0.2",
    userAgent: "Other browser",
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

  afterEach(() => vi.unstubAllGlobals());

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

    fireEvent.change(screen.getByLabelText("邮箱验证密码"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("新邮箱"), {
      target: { value: "next@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送至当前邮箱" }));
    fireEvent.click(screen.getByRole("button", { name: "发送至新邮箱" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/email/challenge",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([url]) => url === "/api/account/email/challenge",
      ),
    ).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("当前邮箱验证码"), {
      target: { value: "111111" },
    });
    fireEvent.change(screen.getByLabelText("新邮箱验证码"), {
      target: { value: "222222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更换邮箱" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/email",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  it("revokes another session and exposes the read-only export", async () => {
    render(<AccountCenter />);
    expect(await screen.findByText("Other browser")).toBeInTheDocument();

    const row = screen.getByText("Other browser").closest("li");
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
    expect(screen.getByRole("link", { name: "导出个人数据" })).toHaveAttribute(
      "href",
      "/api/account/export?locale=zh-CN",
    );
  });

  it("requires an explicit export acknowledgement before deletion verification", async () => {
    render(<AccountCenter />);
    await screen.findByDisplayValue("Current User");
    fireEvent.click(screen.getByRole("button", { name: "申请注销账号" }));

    const dialog = screen.getByRole("dialog", { name: "注销账号" });
    expect(dialog).toHaveTextContent("建议先导出个人数据");
    expect(within(dialog).getByRole("button", { name: "发送验证码" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("checkbox", {
      name: "我已了解数据导出仅供个人查阅",
    }));
    fireEvent.change(within(dialog).getByLabelText("注销验证密码"), {
      target: { value: "old-password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "发送验证码" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/deletion/challenge",
      expect.objectContaining({ method: "POST" }),
    ));
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

    expect(screen.queryByRole("button", { name: "更新密码" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "更换邮箱" })).not.toBeInTheDocument();
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
