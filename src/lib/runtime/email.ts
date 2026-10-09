import { createHash } from "node:crypto";

import nodemailer, { type Transporter } from "nodemailer";

import { getRuntimeConfig } from "@/lib/config/runtime";
import type { ManagedConfig } from "@/lib/config/registry";
import { getBootstrapNodeEnvironment } from "@/lib/config/bootstrap";
import type { AccountEmailChallengePurpose } from "@/lib/auth/account/types";

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

type PasswordResetEmailInput = VerificationEmailInput;

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

interface ProductInvitationEmailInput {
  from: string;
  inviterName: string;
  replacesPreviousLink: boolean;
  to: string;
  url: string;
}

interface AccountVerificationCodeEmailInput {
  from: string;
  name: string;
  to: string;
  code: string;
  purpose: AccountEmailChallengePurpose;
  locale: "zh-CN" | "en-US";
}

interface SocialRegistrationVerificationCodeEmailInput {
  from: string;
  name: string;
  to: string;
  code: string;
  locale: "zh-CN" | "en-US";
}

export type AccountSecurityNoticeEvent =
  | "password_changed"
  | "email_changed"
  | "deletion_requested"
  | "account_restored"
  | "account_deleted"
  | "merge_completed_primary"
  | "merge_completed_secondary"
  | "merge_timed_out"
  | "merge_failed";

interface AccountSecurityNoticeEmailInput {
  from: string;
  name: string;
  to: string;
  event: AccountSecurityNoticeEvent;
  newEmail?: string;
  locale: "zh-CN" | "en-US";
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

export function buildPasswordResetEmail({
  from,
  name,
  to,
  url,
}: PasswordResetEmailInput) {
  const safeName = escapeHtml(name || "AnonResume 用户");
  const safeUrl = escapeHtml(url);
  const safeLogoUrl = escapeHtml(
    new URL("/brand/anonresume-lockup.png", url).toString(),
  );

  return {
    from,
    to,
    subject: "重置你的 AnonResume 密码",
    text: [
      `${name || "你好"}，`,
      "",
      "请在一小时内打开下面的链接重置密码：",
      url,
      "",
      "如果不是你发起的请求，请忽略这封邮件。",
    ].join("\n"),
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f7f3f5;color:#261d22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid #eadfe4;border-radius:22px;background:#ffffff;padding:34px;box-shadow:0 12px 34px rgba(78,45,61,.08);">
        <img src="${safeLogoUrl}" alt="AnonResume" width="210" height="55" style="display:block;width:210px;max-width:70%;height:auto;margin:0 0 24px;border:0;" />
        <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;">重置密码</h1>
        <p style="margin:0 0 12px;line-height:1.7;">${safeName}，你好。</p>
        <p style="margin:0 0 24px;color:#6f6068;line-height:1.7;">点击下面的按钮设置新密码。链接将在一小时后失效。</p>
        <a href="${safeUrl}" style="display:inline-block;border-radius:999px;background:#d73b72;color:#ffffff;padding:12px 22px;text-decoration:none;font-weight:700;">设置新密码</a>
        <p style="margin:28px 0 8px;color:#8a7c83;font-size:13px;line-height:1.6;">如果按钮无法打开，请复制以下地址：</p>
        <p style="margin:0;word-break:break-all;color:#6f6068;font-size:13px;line-height:1.6;">${safeUrl}</p>
      </div>
    </div>
  </body>
</html>`,
  };
}

export function buildAccountVerificationCodeEmail({
  from,
  name,
  to,
  code,
  purpose,
  locale,
}: AccountVerificationCodeEmailInput) {
  const copy = locale === "en-US"
    ? {
        greeting: `Hello ${name || "AnonResume user"},`,
        subjects: {
          change_email_old: "Confirm your current email address",
          change_email_new: "Confirm your new email address",
          delete_account: "Confirm your AnonResume account deletion",
          restore_account: "Confirm your AnonResume account recovery",
        },
        instruction: "Enter this verification code in AnonResume:",
        expiry: "The code expires in 10 minutes. Ignore this email if you did not request it.",
      }
    : {
        greeting: `${name || "AnonResume 用户"}，你好。`,
        subjects: {
          change_email_old: "确认当前 AnonResume 邮箱",
          change_email_new: "确认新的 AnonResume 邮箱",
          delete_account: "确认注销 AnonResume 账号",
          restore_account: "确认恢复 AnonResume 账号",
        },
        instruction: "请在 AnonResume 中输入以下验证码：",
        expiry: "验证码将在 10 分钟后失效。如果不是你发起的操作，请忽略这封邮件。",
      };
  const subject = copy.subjects[purpose];
  const safeName = escapeHtml(copy.greeting);
  const safeCode = escapeHtml(code);

  return {
    from,
    to,
    subject,
    text: [copy.greeting, "", copy.instruction, code, "", copy.expiry].join(
      "\n",
    ),
    html: `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;background:#f7f3f5;color:#261d22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid #eadfe4;border-radius:22px;background:#ffffff;padding:34px;">
        <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;">${escapeHtml(subject)}</h1>
        <p style="margin:0 0 12px;line-height:1.7;">${safeName}</p>
        <p style="margin:0 0 16px;color:#6f6068;line-height:1.7;">${escapeHtml(copy.instruction)}</p>
        <p style="margin:0 0 18px;font-size:32px;font-weight:750;letter-spacing:.18em;">${safeCode}</p>
        <p style="margin:0;color:#8a7c83;font-size:13px;line-height:1.6;">${escapeHtml(copy.expiry)}</p>
      </div>
    </div>
  </body>
</html>`,
  };
}

export function buildSocialRegistrationVerificationCodeEmail({
  from,
  name,
  to,
  code,
  locale,
}: SocialRegistrationVerificationCodeEmailInput) {
  const copy = locale === "en-US"
    ? {
        greeting: `Hello ${name || "AnonResume user"},`,
        subject: "Verify your email to create an AnonResume account",
        instruction: "Enter this verification code in AnonResume:",
        expiry:
          "The code expires in 10 minutes. Ignore this email if you did not request it.",
      }
    : {
        greeting: `${name || "AnonResume 用户"}，你好。`,
        subject: "验证邮箱以创建 AnonResume 账号",
        instruction: "请在 AnonResume 中输入以下验证码：",
        expiry: "验证码将在 10 分钟后失效。如果不是你发起的操作，请忽略这封邮件。",
      };

  return {
    from,
    to,
    subject: copy.subject,
    text: [copy.greeting, "", copy.instruction, code, "", copy.expiry].join(
      "\n",
    ),
    html: `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;background:#f7f3f5;color:#261d22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid #eadfe4;border-radius:22px;background:#ffffff;padding:34px;">
        <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;">${escapeHtml(copy.subject)}</h1>
        <p style="margin:0 0 12px;line-height:1.7;">${escapeHtml(copy.greeting)}</p>
        <p style="margin:0 0 16px;color:#6f6068;line-height:1.7;">${escapeHtml(copy.instruction)}</p>
        <p style="margin:0 0 18px;font-size:32px;font-weight:750;letter-spacing:.18em;">${escapeHtml(code)}</p>
        <p style="margin:0;color:#8a7c83;font-size:13px;line-height:1.6;">${escapeHtml(copy.expiry)}</p>
      </div>
    </div>
  </body>
</html>`,
  };
}

export function buildAccountSecurityNoticeEmail({
  from,
  name,
  to,
  event,
  newEmail,
  locale,
}: AccountSecurityNoticeEmailInput) {
  const english = {
    password_changed: {
      subject: "Your AnonResume password was changed",
      body: "Your account password has been changed and other signed-in sessions were revoked.",
    },
    email_changed: {
      subject: "Your AnonResume email address changed",
      body: `Your sign-in email address was changed${newEmail ? ` to ${newEmail}` : ""}.`,
    },
    deletion_requested: {
      subject: "AnonResume account deletion requested",
      body: "Your account entered the 7-day recovery period.",
    },
    account_restored: {
      subject: "Your AnonResume account was restored",
      body: "The pending account deletion was cancelled.",
    },
    account_deleted: {
      subject: "Your AnonResume account was deleted",
      body: "The account deletion recovery period ended and deletion is complete.",
    },
    merge_completed_primary: {
      subject: "Your AnonResume accounts were merged",
      body: "The account merge completed. Sign in again with the retained account.",
    },
    merge_completed_secondary: {
      subject: "Your AnonResume account was merged",
      body: "This account was merged into the account you selected and can no longer be used to sign in.",
    },
    merge_timed_out: {
      subject: "Your AnonResume account merge timed out",
      body: "The merge was not completed because active work did not finish in time. Your accounts remain separate.",
    },
    merge_failed: {
      subject: "Your AnonResume account merge failed",
      body: "The merge could not be completed. Your accounts remain separate; review them before trying again.",
    },
  } satisfies Record<AccountSecurityNoticeEvent, { subject: string; body: string }>;
  const chinese = {
    password_changed: {
      subject: "你的 AnonResume 密码已修改",
      body: "账号密码已修改，其他已登录会话已被撤销。",
    },
    email_changed: {
      subject: "你的 AnonResume 邮箱已修改",
      body: `登录邮箱已修改${newEmail ? `为 ${newEmail}` : ""}。`,
    },
    deletion_requested: {
      subject: "AnonResume 账号注销申请已提交",
      body: "账号已进入 7 天冷静期。",
    },
    account_restored: {
      subject: "你的 AnonResume 账号已恢复",
      body: "待处理的账号注销已取消。",
    },
    account_deleted: {
      subject: "你的 AnonResume 账号已注销",
      body: "账号注销冷静期已结束，注销处理已完成。",
    },
    merge_completed_primary: {
      subject: "你的 AnonResume 账号已合并",
      body: "账号合并已完成，请使用保留的账号重新登录。",
    },
    merge_completed_secondary: {
      subject: "你的 AnonResume 账号已被合并",
      body: "该账号已合并至你选择保留的账号，无法再用于登录。",
    },
    merge_timed_out: {
      subject: "AnonResume 账号合并已超时",
      body: "由于运行中的任务未能及时结束，本次合并未完成，两个账号仍保持独立。",
    },
    merge_failed: {
      subject: "AnonResume 账号合并失败",
      body: "本次合并未能完成，两个账号仍保持独立，请检查后重试。",
    },
  } satisfies Record<AccountSecurityNoticeEvent, { subject: string; body: string }>;
  const copy = (locale === "en-US" ? english : chinese)[event];
  const greeting = locale === "en-US"
    ? `Hello ${name || "AnonResume user"},`
    : `${name || "AnonResume 用户"}，你好。`;

  return {
    from,
    to,
    subject: copy.subject,
    text: [greeting, "", copy.body, "", locale === "en-US"
      ? "If this was not you, contact the instance administrator immediately."
      : "如果不是你本人操作，请立即联系实例管理员。"].join("\n"),
    html: `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;background:#f7f3f5;color:#261d22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid #eadfe4;border-radius:22px;background:#ffffff;padding:34px;">
        <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;">${escapeHtml(copy.subject)}</h1>
        <p style="margin:0 0 12px;line-height:1.7;">${escapeHtml(greeting)}</p>
        <p style="margin:0;color:#6f6068;line-height:1.7;">${escapeHtml(copy.body)}</p>
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

export function buildProductInvitationEmail({
  from,
  inviterName,
  replacesPreviousLink,
  to,
  url,
}: ProductInvitationEmailInput) {
  const safeInviterName = escapeHtml(inviterName || "一位 AnonResume 用户");
  const safeUrl = escapeHtml(url);
  const safeLogoUrl = escapeHtml(
    new URL("/brand/anonresume-lockup.png", url).toString(),
  );
  const replacementNotice = replacesPreviousLink
    ? "这是该邀请的最新链接，此前收到的链接已失效。"
    : "";

  return {
    from,
    to,
    subject: "你收到了 AnonResume 邀请",
    text: [
      `${inviterName || "一位 AnonResume 用户"} 邀请你使用 AnonResume。`,
      "",
      "请在 7 天内打开下面的链接接受邀请并创建账号：",
      url,
      "",
      replacementNotice,
      "若你不认识邀请人，请忽略这封邮件。",
    ].filter(Boolean).join("\n"),
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f7f3f5;color:#261d22;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid #eadfe4;border-radius:22px;background:#ffffff;padding:34px;box-shadow:0 12px 34px rgba(78,45,61,.08);">
        <img src="${safeLogoUrl}" alt="AnonResume" width="210" height="55" style="display:block;width:210px;max-width:70%;height:auto;margin:0 0 24px;border:0;" />
        <h1 style="margin:0 0 14px;font-size:25px;line-height:1.3;">加入 AnonResume</h1>
        <p style="margin:0 0 12px;line-height:1.7;">${safeInviterName} 邀请你使用 AnonResume。</p>
        <p style="margin:0 0 24px;color:#6f6068;line-height:1.7;">请在 7 天内接受邀请并创建账号。${escapeHtml(replacementNotice)}</p>
        <a href="${safeUrl}" style="display:inline-block;border-radius:999px;background:#d73b72;color:#ffffff;padding:12px 22px;text-decoration:none;font-weight:700;">接受邀请</a>
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

export async function sendPasswordResetEmail({
  email,
  name,
  url,
}: {
  email: string;
  name: string;
  url: string;
}) {
  const config = await getEmailDeliveryConfig();
  const message = buildPasswordResetEmail({
    from: config.from,
    name,
    to: email,
    url,
  });

  if (config.transport === "console") {
    console.info(`[AnonResume] Password reset URL for ${email}: ${url}`);
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

export async function sendProductInvitationEmail({
  email,
  inviterName,
  replacesPreviousLink,
  url,
}: {
  email: string;
  inviterName: string;
  replacesPreviousLink: boolean;
  url: string;
}) {
  const config = await getEmailDeliveryConfig();
  const message = buildProductInvitationEmail({
    from: config.from,
    inviterName,
    replacesPreviousLink,
    to: email,
    url,
  });

  if (config.transport === "console") {
    console.info(`[AnonResume] Product invitation URL for ${email}: ${url}`);
    return;
  }

  await getSmtpTransporter(config).sendMail(message);
}

export async function sendAccountVerificationCode(input: {
  email: string;
  name: string;
  code: string;
  purpose: AccountEmailChallengePurpose;
  locale: "zh-CN" | "en-US";
}) {
  const config = await getEmailDeliveryConfig();
  const message = buildAccountVerificationCodeEmail({
    from: config.from,
    to: input.email,
    ...input,
  });
  if (config.transport === "console") {
    console.info(
      `[AnonResume] Account verification code for ${input.email}: ${input.code}`,
    );
    return;
  }
  await getSmtpTransporter(config).sendMail(message);
}

export async function sendSocialRegistrationVerificationCode(input: {
  email: string;
  name: string;
  code: string;
  locale: "zh-CN" | "en-US";
}) {
  const config = await getEmailDeliveryConfig();
  const message = buildSocialRegistrationVerificationCodeEmail({
    from: config.from,
    to: input.email,
    ...input,
  });
  if (config.transport === "console") {
    console.info(
      `[AnonResume] Social registration verification code for ${input.email}: ${input.code}`,
    );
    return;
  }
  await getSmtpTransporter(config).sendMail(message);
}

export async function sendAccountSecurityNotice(input: {
  email: string;
  name: string;
  event: AccountSecurityNoticeEvent;
  newEmail?: string;
  locale: "zh-CN" | "en-US";
}) {
  const config = await getEmailDeliveryConfig();
  const message = buildAccountSecurityNoticeEmail({
    from: config.from,
    to: input.email,
    ...input,
  });
  if (config.transport === "console") {
    console.info(
      `[AnonResume] Account security notice for ${input.email}: ${input.event}`,
    );
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
