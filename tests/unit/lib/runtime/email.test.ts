import {
  buildAccountSecurityNoticeEmail,
  buildAccountVerificationCodeEmail,
  buildProductInvitationEmail,
  buildPasswordResetEmail,
  buildSocialRegistrationVerificationCodeEmail,
  buildVerificationEmail,
  closeEmailTransporter,
  resolveEmailDeliveryConfig,
} from "@/lib/runtime/email";
import { getManagedConfigDefaults } from "@/lib/config/registry";

function managedConfig(overrides: Record<string, unknown> = {}) {
  return {
    ...getManagedConfigDefaults(),
    ...overrides,
  };
}

describe("email delivery configuration", () => {
  it("closes and clears the shared SMTP transporter", () => {
    const close = vi.fn();
    globalThis.__anonResumeEmailTransporter = { close } as never;

    closeEmailTransporter();

    expect(close).toHaveBeenCalledOnce();
    expect(globalThis.__anonResumeEmailTransporter).toBeUndefined();
  });

  it("uses configured SMTP in development", () => {
    expect(
      resolveEmailDeliveryConfig(
        managedConfig({
          emailFrom: "AnonResume <mailer@example.com>",
          smtpHost: "smtp.example.com",
          smtpPassword: "secret",
          smtpPort: 587,
          smtpUser: "mailer@example.com",
        }),
        "development",
      ),
    ).toEqual({
      from: "AnonResume <mailer@example.com>",
      host: "smtp.example.com",
      password: "secret",
      port: 587,
      requireTLS: true,
      secure: false,
      transport: "smtp",
      user: "mailer@example.com",
    });
  });

  it("uses implicit TLS for port 465", () => {
    expect(
      resolveEmailDeliveryConfig(
        managedConfig({
          smtpHost: "smtp.example.com",
          smtpPassword: "secret",
          smtpPort: 465,
          smtpSecure: true,
          smtpUser: "mailer@example.com",
        }),
        "production",
      ),
    ).toMatchObject({
      from: "mailer@example.com",
      port: 465,
      requireTLS: false,
      secure: true,
      transport: "smtp",
    });
  });

  it("rejects partial SMTP configuration instead of silently logging links", () => {
    expect(() =>
      resolveEmailDeliveryConfig(
        managedConfig({
          smtpHost: "smtp.example.com",
          smtpUser: "mailer@example.com",
        }),
        "development",
      ),
    ).toThrow("SMTP configuration is incomplete");
  });

  it("only falls back to console delivery in non-production without SMTP", () => {
    expect(resolveEmailDeliveryConfig(managedConfig(), "development")).toEqual({
      from: "AnonResume <no-reply@localhost>",
      transport: "console",
    });
    expect(() => resolveEmailDeliveryConfig(managedConfig(), "production")).toThrow(
      "SMTP configuration is required in production",
    );
  });
});

describe("product invitation email", () => {
  it("identifies the inviter and explains link validity without exposing their email", () => {
    const message = buildProductInvitationEmail({
      from: "AnonResume <mailer@example.com>",
      inviterName: "邀请人 <A>",
      replacesPreviousLink: true,
      to: "recipient@example.com",
      url: "https://resume.example.com/accept-invitation?token=secret",
    });

    expect(message.subject).toBe("你收到了 AnonResume 邀请");
    expect(message.text).toContain("邀请人 <A>");
    expect(message.text).toContain("7 天");
    expect(message.text).toContain("最新链接");
    expect(message.text).not.toContain("mailer@example.com");
    expect(message.html).toContain("邀请人 &lt;A&gt;");
  });
});

describe("verification email", () => {
  it("provides both plain text and escaped HTML content", () => {
    const message = buildVerificationEmail({
      from: "AnonResume <mailer@example.com>",
      name: "<Admin>",
      to: "user@example.com",
      url: "https://resume.example.com/api/auth/verify-email?token=a&next=b",
    });

    expect(message.subject).toBe("验证你的 AnonResume 邮箱");
    expect(message.text).toContain(
      "https://resume.example.com/api/auth/verify-email?token=a&next=b",
    );
    expect(message.html).toContain("&lt;Admin&gt;");
    expect(message.html).toContain("token=a&amp;next=b");
    expect(message.html).toContain(
      'src="https://resume.example.com/brand/anonresume-lockup.png"',
    );
    expect(message.html).toContain('alt="AnonResume"');
    expect(message.html).not.toContain(">AnonResume</div>");
  });
});

describe("password recovery email", () => {
  it("includes the one-time link in text and escapes it in HTML", () => {
    const message = buildPasswordResetEmail({
      from: "AnonResume <mailer@example.com>",
      name: "<User>",
      to: "user@example.com",
      url: "https://resume.example.com/api/auth/reset-password/token?callbackURL=%2Freset-password&lang=zh",
    });

    expect(message.text).toContain("callbackURL=%2Freset-password&lang=zh");
    expect(message.html).toContain("&lt;User&gt;");
    expect(message.html).toContain("callbackURL=%2Freset-password&amp;lang=zh");
  });
});

describe("account security email", () => {
  it("renders a purpose-specific verification code in both locales", () => {
    const chinese = buildAccountVerificationCodeEmail({
      from: "AnonResume <mailer@example.com>",
      name: "用户",
      to: "user@example.com",
      code: "123456",
      purpose: "delete_account",
      locale: "zh-CN",
    });
    const english = buildAccountVerificationCodeEmail({
      from: "AnonResume <mailer@example.com>",
      name: "User",
      to: "user@example.com",
      code: "123456",
      purpose: "change_email_new",
      locale: "en-US",
    });

    expect(chinese.subject).toContain("注销");
    expect(chinese.text).toContain("123456");
    expect(english.subject).toContain("email address");
    expect(english.html).toContain("123456");
  });

  it("notifies the old address after an email change", () => {
    const message = buildAccountSecurityNoticeEmail({
      from: "AnonResume <mailer@example.com>",
      name: "User",
      to: "old@example.com",
      event: "email_changed",
      newEmail: "new@example.com",
      locale: "en-US",
    });

    expect(message.subject).toContain("email address changed");
    expect(message.text).toContain("new@example.com");
  });

  it("renders account merge completion and timeout notices", () => {
    const completed = buildAccountSecurityNoticeEmail({
      from: "AnonResume <mailer@example.com>",
      name: "用户",
      to: "user@example.com",
      event: "merge_completed_primary",
      locale: "zh-CN",
    });
    const timedOut = buildAccountSecurityNoticeEmail({
      from: "AnonResume <mailer@example.com>",
      name: "User",
      to: "user@example.com",
      event: "merge_timed_out",
      locale: "en-US",
    });

    expect(completed.subject).toContain("合并");
    expect(timedOut.subject).toContain("timed out");
  });
});

describe("social registration email", () => {
  it("renders the registration code in both supported locales", () => {
    const chinese = buildSocialRegistrationVerificationCodeEmail({
      from: "AnonResume <mailer@example.com>",
      name: "<用户>",
      to: "user@example.com",
      code: "123456",
      locale: "zh-CN",
    });
    const english = buildSocialRegistrationVerificationCodeEmail({
      from: "AnonResume <mailer@example.com>",
      name: "User",
      to: "user@example.com",
      code: "654321",
      locale: "en-US",
    });

    expect(chinese.subject).toContain("创建 AnonResume 账号");
    expect(chinese.html).toContain("&lt;用户&gt;");
    expect(chinese.text).toContain("123456");
    expect(english.subject).toContain("create an AnonResume account");
    expect(english.text).toContain("654321");
  });
});
