import {
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
