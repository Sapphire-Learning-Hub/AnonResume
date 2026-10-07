"use client";

import { DownloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Button, Input } from "antd";
import { createStyles } from "antd-style";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthExperienceShell } from "@/components/auth/AuthExperienceShell";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";

import {
  accountRequestErrorMessage,
  requestAccountJson,
} from "./account-request";

const useStyles = createStyles(({ token, css }) => ({
  content: css`
    display: grid;
    align-content: center;
    flex: 1;
    gap: 18px;
  `,
  heading: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 32px;
    line-height: 1.2;
  `,
  description: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    line-height: 1.75;
  `,
  identity: css`
    overflow: hidden;
    margin: 0;
    color: ${token.colorText};
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  deadline: css`
    display: grid;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 12px;
    background: ${token.colorWarningBg};
    color: ${token.colorWarningText};
  `,
  form: css`
    display: grid;
    gap: 12px;
  `,
  field: css`
    display: grid;
    gap: 7px;
  `,
  label: css`
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 600;
  `,
  actions: css`
    display: grid;
    gap: 10px;
  `,
}));

function remainingTime(deadline: number, now: number) {
  const totalMinutes = Math.max(0, Math.ceil((deadline - now) / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

async function postJson(url: string, body: unknown) {
  await requestAccountJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function AccountRecoveryPage({
  announcements = [],
  deletionDueAt,
  email,
}: {
  announcements?: readonly LocalizedAnnouncement[];
  deletionDueAt: string;
  email: string;
}) {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const deadline = new Date(deletionDueAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<"code" | "restore">();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function sendCode() {
    setBusy("code");
    try {
      await postJson("/api/account/deletion/challenge", {
        purpose: "restore",
        password,
        locale,
      });
      setCodeSent(true);
      toast.success(t("account.email.codeSent"));
    } catch (error) {
      toast.error(accountRequestErrorMessage(error, t));
    } finally {
      setBusy(undefined);
    }
  }

  async function restore() {
    setBusy("restore");
    try {
      await postJson("/api/account/deletion/recover", {
        password,
        code,
        locale,
      });
      toast.success(t("account.recovery.restored"));
      router.push("/app");
      router.refresh();
    } catch (error) {
      toast.error(accountRequestErrorMessage(error, t));
    } finally {
      setBusy(undefined);
    }
  }

  const deadlineText = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(deadline));

  return (
    <AuthExperienceShell announcements={announcements}>
      <div className={styles.content}>
        <h1 className={styles.heading}>{t("account.recovery.title")}</h1>
        <p className={styles.description}>{t("account.recovery.description")}</p>
        <p className={styles.identity}>{email}</p>
        <div className={styles.deadline}>
          <strong>{t("account.recovery.remaining", { time: remainingTime(deadline, now) })}</strong>
          <span>{t("account.recovery.deadline", { time: deadlineText })}</span>
        </div>
        <Button aria-label={t("account.export.action")} href={`/api/account/export?locale=${locale}`} icon={<DownloadOutlined aria-hidden="true" />}>{t("account.export.action")}</Button>
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="recovery-password">{t("account.recovery.password")}</label>
            <Input.Password id="recovery-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <Button aria-label={t("account.recovery.sendCode")} disabled={!password} icon={<SafetyCertificateOutlined aria-hidden="true" />} loading={busy === "code"} onClick={sendCode}>{t("account.recovery.sendCode")}</Button>
          {codeSent ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="recovery-code">{t("account.recovery.code")}</label>
              <Input id="recovery-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
          ) : null}
        </div>
        <div className={styles.actions}>
          <Button disabled={!codeSent || code.length !== 6} loading={busy === "restore"} onClick={restore} type="primary">{t("account.recovery.restore")}</Button>
          <SignOutButton />
        </div>
      </div>
    </AuthExperienceShell>
  );
}
