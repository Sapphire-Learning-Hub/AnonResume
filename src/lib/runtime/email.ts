import { createHash } from "node:crypto";

import nodemailer, { type Transporter } from "nodemailer";

import { getRuntimeConfig } from "@/lib/config/runtime";
import type { ManagedConfig } from "@/lib/config/registry";
import { getBootstrapNodeEnvironment } from "@/lib/config/bootstrap";

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

interface SuperAdminActivationEmailInput {
  from: string;
  to: string;
  url: string;
}

interface UserInvitationEmailInput {
  from: string;
  name: string;
  to: string;
  url: string;
  grantsManagementAccess: boolean;
}

declare global {
  var __anonResumeEmailTransporter: Transporter | undefined;
  var __anonResumeEmailTransporterFingerprint: string | undefined;
}

export function resolveEmailDeliveryConfig(
  configuration: Readonly<ManagedConfig>,
  nodeEnvironment = getBootstrapNodeEnvironment(),
): EmailDeliveryConfig {
  const host = configuration.smtpHost.trim();
  const user = configuration.smtpUser.trim();
  const password = configuration.smtpPassword;
  const hasAnySmtpValue = Boolean(
    host || user || password || configuration.emailFrom.trim(),
  );

  if (!hasAnySmtpValue) {
    if (nodeEnvironment === "production") {
      throw new Error("SMTP configuration is required in production");
    }

    return {
      transport: "console",
      from:
        configuration.emailFrom.trim() ||
        "AnonResume <no-reply@localhost>",
    };
  }

  if (!host || !user || !password) {
    throw new Error(
      "SMTP configuration is incomplete: SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required",
    );
  }

  const port = configuration.smtpPort;
  const secure = configuration.smtpSecure || port === 465;

  return {
    transport: "smtp",
    from: configuration.emailFrom.trim() || user,
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

export function buildSuperAdminActivationEmail({
  from,
  to,
  url,
}: SuperAdminActivationEmailInput) {
  const safeUrl = escapeHtml(url);
  const safeLogoUrl = escapeHtml(
    new URL("/brand/anonresume-lockup.png", url).toString(),
  );

  return {
    from,
    to,
    subject: "激活 AnonResume 超级管理员账号",
    text: [
      "请打开下面的链接激活独立的 AnonResume 超级管理员账号：",
      url,
      "",
      "激活时必须设置密码并绑定虚拟 MFA 设备。若你未部署此实例，请忽略这封邮件。",
    ].join("\n"),
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f7f3f5;color:#261d22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid #eadfe4;border-radius:22px;background:#ffffff;padding:34px;box-shadow:0 12px 34px rgba(78,45,61,.08);">
        <img src="${safeLogoUrl}" alt="AnonResume" width="210" height="55" style="display:block;width:210px;max-width:70%;height:auto;margin:0 0 24px;border:0;" />
        <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;">激活超级管理员账号</h1>
        <p style="margin:0 0 24px;color:#6f6068;line-height:1.7;">此账号仅用于管理中台。激活时需要设置独立密码并绑定虚拟 MFA 设备。</p>
        <a href="${safeUrl}" style="display:inline-block;border-radius:999px;background:#d73b72;color:#ffffff;padding:12px 22px;text-decoration:none;font-weight:700;">开始激活</a>
        <p style="margin:28px 0 8px;color:#8a7c83;font-size:13px;line-height:1.6;">如果按钮无法打开，请复制以下地址：</p>
        <p style="margin:0;word-break:break-all;color:#6f6068;font-size:13px;line-height:1.6;">${safeUrl}</p>
      </div>
    </div>
  </body>
</html>`,
  };
}

export function buildUserInvitationEmail({
  from,
  name,
  to,
  url,
  grantsManagementAccess,
}: UserInvitationEmailInput) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);
  const safeLogoUrl = escapeHtml(
    new URL("/brand/anonresume-lockup.png", url).toString(),
  );
  const accessDescription = grantsManagementAccess
    ? "该邀请同时包含管理中台权限，激活时必须绑定虚拟 MFA 设备。"
    : "激活后即可登录 AnonResume 工作台。";

  return {
    from,
    to,
    subject: "你已受邀使用 AnonResume",
    text: [
      `${name}，你好。`,
      "",
      "请打开下面的链接设置密码并激活账号：",
      url,
      "",
      accessDescription,
      "若你不认识邀请人，请忽略这封邮件。",
    ].join("\n"),
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f7f3f5;color:#261d22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid #eadfe4;border-radius:22px;background:#ffffff;padding:34px;box-shadow:0 12px 34px rgba(78,45,61,.08);">
        <img src="${safeLogoUrl}" alt="AnonResume" width="210" height="55" style="display:block;width:210px;max-width:70%;height:auto;margin:0 0 24px;border:0;" />
        <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;">激活你的邀请账号</h1>
        <p style="margin:0 0 12px;line-height:1.7;">${safeName}，你好。</p>
        <p style="margin:0 0 24px;color:#6f6068;line-height:1.7;">${escapeHtml(accessDescription)}</p>
        <a href="${safeUrl}" style="display:inline-block;border-radius:999px;background:#d73b72;color:#ffffff;padding:12px 22px;text-decoration:none;font-weight:700;">设置密码并激活</a>
        <p style="margin:28px 0 8px;color:#8a7c83;font-size:13px;line-height:1.6;">如果按钮无法打开，请复制以下地址：</p>
        <p style="margin:0;word-break:break-all;color:#6f6068;font-size:13px;line-height:1.6;">${safeUrl}</p>
      </div>
    </div>
  </body>
</html>`,
  };
}

function getSmtpTransporter(config: Extract<EmailDeliveryConfig, { transport: "smtp" }>) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex");
  if (
    globalThis.__anonResumeEmailTransporter &&
    globalThis.__anonResumeEmailTransporterFingerprint !== fingerprint
  ) {
    closeEmailTransporter();
  }
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
  globalThis.__anonResumeEmailTransporterFingerprint = fingerprint;

  return globalThis.__anonResumeEmailTransporter;
}

export function closeEmailTransporter() {
  const transporter = globalThis.__anonResumeEmailTransporter;
  globalThis.__anonResumeEmailTransporter = undefined;
  globalThis.__anonResumeEmailTransporterFingerprint = undefined;
  transporter?.close();
}

async function getEmailDeliveryConfig() {
  const runtime = await getRuntimeConfig("web");
  return resolveEmailDeliveryConfig(runtime.values);
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
  const config = await getEmailDeliveryConfig();
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

export async function sendSuperAdminActivationEmail({
  email,
  url,
}: {
  email: string;
  url: string;
}) {
  const config = await getEmailDeliveryConfig();
  const message = buildSuperAdminActivationEmail({
    from: config.from,
    to: email,
    url,
  });

  if (config.transport === "console") {
    console.info(`[AnonResume] Super-admin activation URL for ${email}: ${url}`);
    return;
  }

  await getSmtpTransporter(config).sendMail(message);
}

export async function sendUserInvitationEmail({
  email,
  name,
  url,
  grantsManagementAccess,
}: {
  email: string;
  name: string;
  url: string;
  grantsManagementAccess: boolean;
}) {
  const config = await getEmailDeliveryConfig();
  const message = buildUserInvitationEmail({
    from: config.from,
    name,
    to: email,
    url,
    grantsManagementAccess,
  });

  if (config.transport === "console") {
    console.info(`[AnonResume] Invitation URL for ${email}: ${url}`);
    return;
  }

  await getSmtpTransporter(config).sendMail(message);
}

export async function verifyEmailDelivery() {
  const config = await getEmailDeliveryConfig();

  if (config.transport === "console") {
    return { transport: "console" as const };
  }

  await getSmtpTransporter(config).verify();
  return { transport: "smtp" as const };
}
