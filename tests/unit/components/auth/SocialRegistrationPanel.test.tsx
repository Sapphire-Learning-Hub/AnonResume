import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const authMocks = vi.hoisted(() => ({
  signInEmail: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

const feedbackMocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    signIn: { email: authMocks.signInEmail },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    notification: { destroy: vi.fn(), error: vi.fn() },
    toast: {
      error: feedbackMocks.toastError,
      success: feedbackMocks.toastSuccess,
    },
  }),
}));

import { SocialRegistrationPanel } from "@/components/auth/SocialRegistrationPanel";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fillPasswords() {
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "strong-password" },
  });
  fireEvent.change(screen.getByLabelText("确认密码"), {
    target: { value: "strong-password" },
  });
}

describe("SocialRegistrationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the account with an editable name and verified GitHub email", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        state: "password",
        displayName: "GitHub User",
        imageUrl: null,
        email: "github@example.com",
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: "created",
        email: "github@example.com",
      }));
    vi.stubGlobal("fetch", fetchMock);
    authMocks.signInEmail.mockResolvedValue({ data: {}, error: null });

    render(<SocialRegistrationPanel />);

    const email = await screen.findByLabelText("登录邮箱");
    expect(email).toHaveValue("github@example.com");
    expect(email).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("显示名称"), {
      target: { value: "Edited Name" },
    });
    fillPasswords();
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/registration/social/complete",
        expect.objectContaining({
          body: JSON.stringify({
            displayName: "Edited Name",
            password: "strong-password",
          }),
          method: "POST",
        }),
      );
      expect(authMocks.signInEmail).toHaveBeenCalledWith({
        callbackURL: "/app",
        email: "github@example.com",
        password: "strong-password",
      });
      expect(routerMocks.push).toHaveBeenCalledWith("/app");
    });
  });

  it("verifies a user-supplied email before showing password setup", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        state: "email",
        displayName: "GitHub User",
        imageUrl: null,
        email: null,
      }))
      .mockResolvedValueOnce(jsonResponse({ retryAfterSeconds: 60 }))
      .mockResolvedValueOnce(jsonResponse({ email: "new@example.com" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SocialRegistrationPanel />);

    const email = await screen.findByLabelText("邮箱地址");
    fireEvent.change(email, { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));

    expect(await screen.findByLabelText("邮箱验证码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /60 秒后可重新发送/ }))
      .toBeDisabled();
    fireEvent.change(screen.getByLabelText("邮箱验证码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证邮箱" }));

    expect(await screen.findByLabelText("登录邮箱"))
      .toHaveValue("new@example.com");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/registration/social/email/challenge",
      expect.objectContaining({
        body: JSON.stringify({ email: "new@example.com", locale: "zh-CN" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/registration/social/email/verify",
      expect.objectContaining({
        body: JSON.stringify({ code: "123456" }),
        method: "POST",
      }),
    );
  });

  it("rejects mismatched passwords before creating the account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      state: "password",
      displayName: "GitHub User",
      imageUrl: null,
      email: "github@example.com",
    })));

    render(<SocialRegistrationPanel />);
    await screen.findByLabelText("登录邮箱");
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "strong-password" },
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    expect(feedbackMocks.toastError).toHaveBeenCalledWith(
      "两次输入的密码不一致。",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("offers a sign-in recovery when the intent has expired", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse({ error: "intent_expired" }, 410),
    ));

    render(<SocialRegistrationPanel />);

    expect(await screen.findByRole("heading", { name: "注册流程已失效" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回登录" }));
    expect(routerMocks.push).toHaveBeenCalledWith("/sign-in");
  });

  it("stops the flow when a verified email already belongs to an account", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        state: "email",
        displayName: "GitHub User",
        imageUrl: null,
        email: null,
      }))
      .mockResolvedValueOnce(jsonResponse({ retryAfterSeconds: 60 }))
      .mockResolvedValueOnce(jsonResponse({ error: "email_conflict" }, 409));
    vi.stubGlobal("fetch", fetchMock);

    render(<SocialRegistrationPanel />);
    fireEvent.change(await screen.findByLabelText("邮箱地址"), {
      target: { value: "existing@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送验证码" }));
    fireEvent.change(await screen.findByLabelText("邮箱验证码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证邮箱" }));

    expect(await screen.findByRole("heading", { name: "该账号已存在" }))
      .toBeInTheDocument();
    expect(screen.getByText(/请使用原登录方式登录/)).toBeInTheDocument();
  });

  it("does not claim the account exists when creation cannot be confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        state: "password",
        displayName: "GitHub User",
        imageUrl: null,
        email: "github@example.com",
      }))
      .mockRejectedValueOnce(new TypeError("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    render(<SocialRegistrationPanel />);
    await screen.findByLabelText("登录邮箱");
    fillPasswords();
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    await waitFor(() => {
      expect(feedbackMocks.toastError).toHaveBeenCalledWith("认证请求失败");
    });
    expect(screen.queryByRole("heading", { name: "账号已创建" }))
      .not.toBeInTheDocument();
  });

  it("does not retry account creation when automatic sign-in fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        state: "password",
        displayName: "GitHub User",
        imageUrl: null,
        email: "github@example.com",
      }))
      .mockResolvedValueOnce(jsonResponse({
        status: "created",
        email: "github@example.com",
      }));
    vi.stubGlobal("fetch", fetchMock);
    authMocks.signInEmail.mockResolvedValue({
      data: null,
      error: { code: "FAILED_TO_CREATE_SESSION" },
    });

    render(<SocialRegistrationPanel />);
    await screen.findByLabelText("登录邮箱");
    fillPasswords();
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    expect(await screen.findByRole("heading", { name: "账号已创建" }))
      .toBeInTheDocument();
    expect(screen.getByText(/请使用刚刚设置的邮箱和密码登录/))
      .toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "返回登录" }));
    expect(routerMocks.push).toHaveBeenCalledWith("/sign-in");
  });
});
