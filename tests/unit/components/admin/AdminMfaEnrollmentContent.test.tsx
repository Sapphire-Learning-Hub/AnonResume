import { render, screen } from "@testing-library/react";

import { AdminMfaEnrollmentContent } from "@/components/admin/AdminMfaEnrollmentContent";

describe("AdminMfaEnrollmentContent", () => {
  it("presents enrollment as a labeled and centered verification flow", () => {
    const { container } = render(
      <AdminMfaEnrollmentContent
        code=""
        enrollment={{
          deviceId: "device-1",
          secret: "ABCDEFGHIJKLMNOP",
          uri: "otpauth://totp/AnonResume:owner@example.com?secret=ABCDEFGHIJKLMNOP",
        }}
        onCodeChange={() => undefined}
      />,
    );

    expect(
      screen.getByText("使用认证器扫描二维码，然后输入当前显示的 6 位验证码。"),
    ).toHaveClass("admin-mfa-enrollment__description-line");
    expect(
      screen.getByText(
        "推荐使用 Microsoft Authenticator 或 Google Authenticator，也支持其他兼容 TOTP 的应用。",
      ),
    ).toHaveClass("admin-mfa-enrollment__description-line");
    expect(screen.getByText("扫描二维码")).toBeInTheDocument();
    expect(screen.getByText("手动输入密钥")).toBeInTheDocument();
    expect(screen.getByText("ABCDEFGHIJKLMNOP")).toHaveClass(
      "admin-mfa-enrollment__secret",
    );
    expect(screen.getByText("6 位验证码")).toBeInTheDocument();
    expect(container.querySelector(".admin-mfa-enrollment__qr")).not.toBeNull();
    expect(screen.getByRole("group")).toHaveClass("admin-otp");
  });
});
