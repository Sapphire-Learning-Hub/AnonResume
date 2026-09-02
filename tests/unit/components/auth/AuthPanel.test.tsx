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

vi.mock("@/lib/auth-client", () => ({
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
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    expect(screen.getByText("请先验证邮箱后再登录。")).toBeInTheDocument();

    fireEvent.click(resend);

    await waitFor(() => {
      expect(authMocks.sendVerificationEmail).toHaveBeenCalledWith({
        callbackURL: "/sign-in?verified=1",
        email: "user@example.com",
      });
    });
    expect(await screen.findByText("验证邮件已重新发送。")).toBeInTheDocument();
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

      expect(
        screen.getByText("验证链接无效或已经过期，请重新发送验证邮件。"),
      ).toBeInTheDocument();
    },
  );
});
