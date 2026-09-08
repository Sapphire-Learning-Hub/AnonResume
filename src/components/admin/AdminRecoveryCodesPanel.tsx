"use client";

import { Button } from "antd";
import { type ReactNode, useState } from "react";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";
import type { AppLocale } from "@/i18n/messages";

export function formatRecoveryGeneratedAt({
  generatedAt,
  locale,
  timeZone,
}: {
  generatedAt: Date;
  locale: AppLocale;
  timeZone: string;
}) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone,
  }).format(generatedAt);
}

export function formatRecoveryCodesFileDate(
  generatedAt: Date,
  timeZone: string,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(generatedAt);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildRecoveryCodesText({
  codes,
  email,
  generatedAt,
  locale,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: {
  codes: string[];
  email: string;
  generatedAt: Date;
  locale: AppLocale;
  timeZone?: string;
}) {
  const formattedGeneratedAt = formatRecoveryGeneratedAt({
    generatedAt,
    locale,
    timeZone,
  });
  const lines =
    locale === "zh-CN"
      ? [
          "AnonResume 管理员恢复码",
          "",
          `账号：${email}`,
          `生成时间：${formattedGeneratedAt}`,
          "",
          "安全提示：请离线保管。每个恢复码只能使用一次，请勿以明文发送给他人。",
          "",
          ...codes,
        ]
      : [
          "AnonResume administrator recovery codes",
          "",
          `Account: ${email}`,
          `Generated at: ${formattedGeneratedAt}`,
          "",
          "Security notice: Store these codes offline. Each code can be used only once. Do not send them to anyone in plain text.",
          "",
          ...codes,
        ];

  return `${lines.join("\n")}\n`;
}

function downloadRecoveryCodes({
  codes,
  email,
  generatedAt,
  locale,
  timeZone,
}: {
  codes: string[];
  email: string;
  generatedAt: Date;
  locale: AppLocale;
  timeZone: string;
}) {
  const content = buildRecoveryCodesText({
    codes,
    email,
    generatedAt,
    locale,
    timeZone,
  });
  const objectUrl = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `anonresume-recovery-codes-${formatRecoveryCodesFileDate(generatedAt, timeZone)}.txt`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function AdminRecoveryCodesPanel({
  codes,
  continueLabel,
  email,
  onContinue,
}: {
  codes: string[];
  continueLabel?: ReactNode;
  email: string;
  onContinue: () => void;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const [generatedAt] = useState(() => new Date());
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const formattedGeneratedAt = formatRecoveryGeneratedAt({
    generatedAt,
    locale,
    timeZone,
  });

  return (
    <section className="admin-recovery-sheet">
      <AnonResumeLogo
        className="admin-recovery-print-logo"
        variant="lockup"
      />
      <h1 className="admin-recovery-title">{t("activation.saveCodes")}</h1>
      <p className="admin-recovery-description">
        {t("activation.saveCodesDescription")}
      </p>
      <dl className="admin-recovery-print-meta">
        <div>
          <dt>{t("activation.accountLabel")}</dt>
          <dd>{email}</dd>
        </div>
        <div>
          <dt>{t("activation.generatedAt")}</dt>
          <dd>
            <time dateTime={generatedAt.toISOString()}>
              {formattedGeneratedAt}
            </time>
          </dd>
        </div>
      </dl>
      <ul className="admin-recovery-list">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="admin-recovery-actions">
        <Button
          block
          onClick={() =>
            downloadRecoveryCodes({
              codes,
              email,
              generatedAt,
              locale,
              timeZone,
            })
          }
          size="large"
          type="primary"
        >
          {t("activation.downloadCodes")}
        </Button>
        <Button block onClick={() => window.print()} size="large">
          {t("activation.printCodes")}
        </Button>
        <Button block onClick={onContinue} size="large" type="link">
          {continueLabel ?? t("activation.goToSignIn")}
        </Button>
      </div>
    </section>
  );
}
