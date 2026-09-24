import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const authMocks = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
  signUpEmail: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

const feedbackMocks = vi.hoisted(() => ({
  notificationDestroy: vi.fn(),
  notificationError: vi.fn(),
  notificationWarning: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    sendVerificationEmail: authMocks.sendVerificationEmail,
    requestPasswordReset: authMocks.requestPasswordReset,
    resetPassword: authMocks.resetPassword,
    signIn: {
      email: authMocks.signInEmail,
      social: authMocks.signInSocial,
    },
    signUp: {
      email: authMocks.signUpEmail,
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    notification: {
      destroy: feedbackMocks.notificationDestroy,
      error: feedbackMocks.notificationError,
      warning: feedbackMocks.notificationWarning,
    },
    toast: {
      error: feedbackMocks.toastError,
      success: feedbackMocks.toastSuccess,
    },
  }),
}));

import { AuthPanel } from "@/components/auth/AuthPanel";
import { PasswordResetPanel } from "@/components/auth/PasswordResetPanel";

function fillEmailPasswordForm() {
  fireEvent.change(screen.getByTestId("auth-email-input"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(screen.getByTestId("auth-password-input"), {
    target: { value: "strong-password" },
  });
}

describe("AuthPanel email verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("eagerly loads the above-the-fold brand image", () => {
    render(<AuthPanel githubEnabled={false} />);

    expect(screen.getByRole("img", { name: "AnonResume" })).toHaveAttribute(
      "loading",
      "eager",
    );
  });

  it("updates the card introduction when switching authentication modes", () => {
    render(<AuthPanel githubEnabled={false} />);

    expect(
      screen.getByRole("heading", { name: "欢迎回来" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("继续整理、发布和导出你的简历。"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("auth-switch-sign-up"));

    expect(
      screen.getByRole("heading", { name: "创建账号" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("创建账号，开始制作你的第一份简历。"),
    ).toBeInTheDocument();
  });

  it("shows a verification state after email registration instead of entering the app", async () => {
    authMocks.signUpEmail.mockResolvedValue({
      data: { token: null, user: { email: "user@example.com" } },
      error: null,
    });

    render(<AuthPanel githubEnabled={false} />);

    fireEvent.click(screen.getByTestId("auth-switch-sign-up"));
    fireEvent.change(screen.getByTestId("auth-name-input"), {
      target: { value: "Example User" },
    });
    fillEmailPasswordForm();
    fireEvent.change(screen.getByTestId("auth-confirm-password-input"), {
      target: { value: "strong-password" },
    });
    fireEvent.click(screen.getByTestId("auth-submit"));

    expect(await screen.findByText("验证邮件已发送")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByTestId("verification-status-icon")).toBeInTheDocument();
    expect(screen.getByTestId("verification-email")).toHaveTextContent(
      "user@example.com",
    );
    expect(feedbackMocks.toastError).not.toHaveBeenCalled();
    expect(routerMocks.push).not.toHaveBeenCalled();
    expect(authMocks.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/sign-in?verified=1" }),
    );
  });

  it("offers a resend action when an unverified user signs in", async () => {
    authMocks.signInEmail.mockResolvedValue({
      data: null,
      error: {
        code: "EMAIL_NOT_VERIFIED",
        message: "Email not verified",
        status: 403,
      },
    });
    authMocks.sendVerificationEmail.mockResolvedValue({
      data: { status: true },
      error: null,
    });

    render(<AuthPanel githubEnabled={false} />);
    fillEmailPasswordForm();
    fireEvent.click(screen.getByTestId("auth-submit"));

    const resend = await screen.findByRole("button", {
      name: "重新发送验证邮件",
    });
    expect(feedbackMocks.notificationWarning).toHaveBeenCalledWith(
      expect.objectContaining({ title: "请先验证邮箱后再登录。" }),
    );

    fireEvent.click(resend);

    await waitFor(() => {
      expect(authMocks.sendVerificationEmail).toHaveBeenCalledWith({
        callbackURL: "/sign-in?verified=1",
        email: "user@example.com",
      });
    });
    expect(feedbackMocks.toastSuccess).toHaveBeenCalledWith(
      "验证邮件已重新发送。",
    );
  });

  it.each([
    ["INVALID_EMAIL_OR_PASSWORD", "邮箱或密码不正确。"],
    ["INVALID_EMAIL", "请输入有效的邮箱地址。"],
    ["FAILED_TO_CREATE_SESSION", "暂时无法创建登录会话，请稍后重试。"],
    ["EMAIL_PASSWORD_DISABLED", "邮箱密码登录暂时不可用。"],
    ["TOO_MANY_REQUESTS", "尝试次数过多，请稍后再试。"],
  ])("maps the %s sign-in error code to actionable feedback", async (code, message) => {
    authMocks.signInEmail.mockResolvedValue({
      data: null,
      error: { code, message: "Raw authentication service error", status: 400 },
    });

    render(<AuthPanel githubEnabled={false} />);
    fillEmailPasswordForm();
    fireEvent.click(screen.getByTestId("auth-submit"));

    await waitFor(() => {
      expect(feedbackMocks.toastError).toHaveBeenCalledWith(message);
    });
  });

  it("does not expose raw authentication service errors", async () => {
    authMocks.signInEmail.mockResolvedValue({
      data: null,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "database host db.internal.example refused connection",
        status: 500,
      },
    });

    render(<AuthPanel githubEnabled={false} />);
    fillEmailPasswordForm();
    fireEvent.click(screen.getByTestId("auth-submit"));

    await waitFor(() => {
      expect(feedbackMocks.toastError).toHaveBeenCalledWith(
        "认证请求失败",
      );
    });
    expect(feedbackMocks.toastError).not.toHaveBeenCalledWith(
      expect.stringContaining("db.internal.example"),
    );
  });

  it("requests recovery without revealing whether an email belongs to an account", async () => {
    authMocks.requestPasswordReset.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    render(<AuthPanel githubEnabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "忘记密码" }));
    fireEvent.change(screen.getByTestId("auth-email-input"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByTestId("auth-submit"));

    expect(await screen.findByText(/如果该邮箱已注册/)).toBeInTheDocument();
    expect(screen.queryByTestId("auth-email-input")).not.toBeInTheDocument();
    expect(authMocks.requestPasswordReset).toHaveBeenCalledWith({
      email: "user@example.com",
      redirectTo: "/reset-password",
    });
  });

  it("explains when password recovery has not loaded on the server", async () => {
    authMocks.requestPasswordReset.mockResolvedValue({
      data: null,
      error: {
        code: "RESET_PASSWORD_DISABLED",
        message: "Reset password isn't enabled",
        status: 400,
      },
    });
    render(<AuthPanel githubEnabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "忘记密码" }));
    fireEvent.change(screen.getByTestId("auth-email-input"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByTestId("auth-submit"));

    await waitFor(() => {
      expect(feedbackMocks.toastError).toHaveBeenCalledWith(
        "密码找回暂不可用，请稍后重试或联系管理员。",
      );
    });
  });

  it.each(["INVALID_TOKEN", "TOKEN_EXPIRED"])(
    "explains the %s verification failure",
    (verificationError) => {
      render(
        <AuthPanel
          githubEnabled={false}
          verificationError={verificationError}
        />,
      );

      expect(feedbackMocks.notificationError).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "验证链接无效或已经过期，请重新发送验证邮件。",
        }),
      );
    },
  );

  it("explains that a suspended account cannot sign in", () => {
    render(
      <AuthPanel
        githubEnabled={false}
        verificationError="ACCOUNT_SUSPENDED"
      />,
    );

    expect(feedbackMocks.notificationError).toHaveBeenCalledWith(
      expect.objectContaining({ title: "该账户已被停用，请联系管理员。" }),
    );
  });
});

describe("PasswordResetPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replaces a valid token with a new password and clears the link from browser history", async () => {
    authMocks.resetPassword.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<PasswordResetPanel token="one-time-token" />);

    fireEvent.change(screen.getByTestId("reset-password-input"), {
      target: { value: "new-strong-password" },
    });
    fireEvent.change(screen.getByTestId("reset-confirm-password-input"), {
      target: { value: "new-strong-password" },
    });
    fireEvent.click(screen.getByTestId("reset-submit"));

    expect(await screen.findByText(/密码已重置/)).toBeInTheDocument();
    expect(authMocks.resetPassword).toHaveBeenCalledWith({
      newPassword: "new-strong-password",
      token: "one-time-token",
    });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/reset-password");
    replaceState.mockRestore();
  });

  it("rejects mismatched passwords before submitting", () => {
    render(<PasswordResetPanel token="one-time-token" />);
    fireEvent.change(screen.getByTestId("reset-password-input"), {
      target: { value: "new-strong-password" },
    });
    fireEvent.change(screen.getByTestId("reset-confirm-password-input"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByTestId("reset-submit"));

    expect(authMocks.resetPassword).not.toHaveBeenCalled();
  });

  it("removes an expired reset token from the URL", async () => {
    authMocks.resetPassword.mockResolvedValue({
      data: null,
      error: { code: "INVALID_TOKEN", message: "Invalid token", status: 400 },
    });
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<PasswordResetPanel token="expired-token" />);
    fireEvent.change(screen.getByTestId("reset-password-input"), {
      target: { value: "new-strong-password" },
    });
    fireEvent.change(screen.getByTestId("reset-confirm-password-input"), {
      target: { value: "new-strong-password" },
    });
    fireEvent.click(screen.getByTestId("reset-submit"));

    expect(await screen.findByText(/重置链接无效或已过期/)).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/reset-password");
    replaceState.mockRestore();
  });
});
