import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const authMocks = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
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
