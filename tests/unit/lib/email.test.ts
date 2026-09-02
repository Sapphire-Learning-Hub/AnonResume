import {
  buildVerificationEmail,
  resolveEmailDeliveryConfig,
} from "@/lib/email";

describe("email delivery configuration", () => {
  it("uses configured SMTP in development", () => {
    expect(
      resolveEmailDeliveryConfig(
        {
          EMAIL_FROM: "AnonResume <mailer@example.com>",
          SMTP_HOST: "smtp.example.com",
          SMTP_PASSWORD: "secret",
          SMTP_PORT: "587",
          SMTP_USER: "mailer@example.com",
        },
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
        {
          SMTP_HOST: "smtp.example.com",
          SMTP_PASSWORD: "secret",
          SMTP_PORT: "465",
          SMTP_USER: "mailer@example.com",
        },
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
        {
          SMTP_HOST: "smtp.example.com",
          SMTP_USER: "mailer@example.com",
        },
        "development",
      ),
    ).toThrow("SMTP configuration is incomplete");
  });

  it("only falls back to console delivery in non-production without SMTP", () => {
    expect(resolveEmailDeliveryConfig({}, "development")).toEqual({
      from: "AnonResume <no-reply@localhost>",
      transport: "console",
    });
    expect(() => resolveEmailDeliveryConfig({}, "production")).toThrow(
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
