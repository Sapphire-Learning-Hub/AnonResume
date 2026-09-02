import nodemailer, { type Transporter } from "nodemailer";

type EmailEnvironment = Record<string, string | undefined>;

export type EmailDeliveryConfig =
  | {
      transport: "console";
      from: string;
    }
  | {
      transport: "smtp";
      from: string;
      host: string;
      port: number;
      secure: boolean;
      requireTLS: boolean;
      user: string;
      password: string;
    };

interface VerificationEmailInput {
  from: string;
  name: string;
  to: string;
  url: string;
}

declare global {
  var __anonResumeEmailTransporter: Transporter | undefined;
}

function parsePort(value: string | undefined) {
  const port = value ? Number(value) : 587;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }

  return port;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("SMTP_SECURE must be either true or false");
}

export function resolveEmailDeliveryConfig(
  environment: EmailEnvironment,
  nodeEnvironment = environment.NODE_ENV,
): EmailDeliveryConfig {
  const host = environment.SMTP_HOST?.trim();
  const user = environment.SMTP_USER?.trim();
  const password = environment.SMTP_PASSWORD;
  const hasAnySmtpValue = Boolean(
    host || user || password || environment.SMTP_PORT || environment.SMTP_SECURE,
  );

  if (!hasAnySmtpValue) {
    if (nodeEnvironment === "production") {
      throw new Error("SMTP configuration is required in production");
    }

    return {
      transport: "console",
      from: environment.EMAIL_FROM?.trim() || "AnonResume <no-reply@localhost>",
    };
  }

  if (!host || !user || !password) {
    throw new Error(
      "SMTP configuration is incomplete: SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required",
    );
  }

  const port = parsePort(environment.SMTP_PORT);
  const secure = parseBoolean(environment.SMTP_SECURE, port === 465);

  return {
    transport: "smtp",
    from: environment.EMAIL_FROM?.trim() || user,
    host,
    port,
    secure,
    requireTLS: !secure,
    user,
    password,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildVerificationEmail({
  from,
  name,
  to,
  url,
}: VerificationEmailInput) {
  const safeName = escapeHtml(name || "AnonResume 用户");
  const safeUrl = escapeHtml(url);
  const safeLogoUrl = escapeHtml(
    new URL("/brand/anonresume-lockup.png", url).toString(),
  );

  return {
    from,
    to,
    subject: "验证你的 AnonResume 邮箱",
    text: [
      `${name || "你好"}，`,
      "",
      "请打开下面的链接验证你的 AnonResume 邮箱：",
      url,
      "",
      "如果不是你发起的注册，请忽略这封邮件。",
    ].join("\n"),
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f7f3f5;color:#261d22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid #eadfe4;border-radius:22px;background:#ffffff;padding:34px;box-shadow:0 12px 34px rgba(78,45,61,.08);">
        <img src="${safeLogoUrl}" alt="AnonResume" width="210" height="55" style="display:block;width:210px;max-width:70%;height:auto;margin:0 0 24px;border:0;" />
        <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;">验证你的邮箱</h1>
        <p style="margin:0 0 12px;line-height:1.7;">${safeName}，你好。</p>
        <p style="margin:0 0 24px;color:#6f6068;line-height:1.7;">点击下面的按钮完成邮箱验证。验证链接将在一段时间后失效。</p>
        <a href="${safeUrl}" style="display:inline-block;border-radius:999px;background:#d73b72;color:#ffffff;padding:12px 22px;text-decoration:none;font-weight:700;">验证邮箱</a>
        <p style="margin:28px 0 8px;color:#8a7c83;font-size:13px;line-height:1.6;">如果按钮无法打开，请复制以下地址：</p>
        <p style="margin:0;word-break:break-all;color:#6f6068;font-size:13px;line-height:1.6;">${safeUrl}</p>
      </div>
    </div>
  </body>
</html>`,
  };
}

function getSmtpTransporter(config: Extract<EmailDeliveryConfig, { transport: "smtp" }>) {
  globalThis.__anonResumeEmailTransporter ??= nodemailer.createTransport({
    pool: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  return globalThis.__anonResumeEmailTransporter;
}

export async function sendVerificationEmail({
  email,
  name,
  url,
}: {
  email: string;
  name: string;
  url: string;
}) {
  const config = resolveEmailDeliveryConfig(process.env);
  const message = buildVerificationEmail({
    from: config.from,
    name,
    to: email,
    url,
  });

  if (config.transport === "console") {
    console.info(`[AnonResume] Verification URL for ${email}: ${url}`);
    return;
  }

  await getSmtpTransporter(config).sendMail(message);
}

export async function verifyEmailDelivery() {
  const config = resolveEmailDeliveryConfig(process.env);

  if (config.transport === "console") {
    return { transport: "console" as const };
  }

  await getSmtpTransporter(config).verify();
  return { transport: "smtp" as const };
}
