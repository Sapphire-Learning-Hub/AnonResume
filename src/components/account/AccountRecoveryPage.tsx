"use client";

import { DownloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Button, Input } from "antd";
import { createStyles } from "antd-style";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthExperienceShell } from "@/components/auth/AuthExperienceShell";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useVerificationCooldown } from "@/components/ui/useVerificationCooldown";
import { useI18n } from "@/i18n/I18nProvider";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";

import {
  accountRequestErrorMessage,
  requestAccountJson,
} from "./account-request";

const useStyles = createStyles(({ token, css }) => ({
  content: css`
    display: flex;
    flex: 1;
    flex-direction: column;
  `,
  introduction: css`
    display: grid;
    gap: 10px;
  `,
  heading: css`
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: 26px;
    line-height: 1.2;
    letter-spacing: -0.025em;
  `,
  description: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 14px;
    line-height: 1.7;
  `,
  accountSummary: css`
    display: grid;
    gap: 12px;
    margin-top: 28px;
    padding: 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 10px;
    background: ${token.colorFillQuaternary};
  `,
  identity: css`
    overflow: hidden;
    margin: 0;
    color: ${token.colorText};
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  deadline: css`
    display: grid;
    gap: 3px;
    color: ${token.colorWarningText};
  `,
  deadlineValue: css`
    font-size: 15px;
    line-height: 1.5;
  `,
  deadlineText: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1.5;
  `,
  form: css`
    display: grid;
    gap: 14px;
    margin-top: 28px;
  `,
  field: css`
    display: grid;
    gap: 7px;
  `,
  recoveryRow: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 12px;

    @media (max-width: 520px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  recoveryAction: css`
    && {
      min-width: 124px;
    }

    @media (max-width: 520px) {
      && {
        width: 100%;
      }
    }
  `,
  verificationInputRow: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;

    @media (max-width: 520px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  label: css`
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 600;
  `,
  control: css`
    && {
      min-height: 42px;
      border-radius: 10px;
    }

    &&.ant-input-affix-wrapper .ant-input {
      min-height: auto;
    }
  `,
  secondaryActions: css`
    display: grid;
    gap: 8px;
    margin-top: auto;
    padding-top: 32px;
  `,
  secondaryButton: css`
    && {
      height: 42px;
      border-radius: 10px;
    }
  `,
  signOut: css`
    && {
      justify-self: center;
      height: auto;
      padding: 0 8px;
      color: ${token.colorTextSecondary};
      font-size: 13px;
    }

    &&:hover {
      color: ${token.colorPrimary};
      background: transparent;
    }
  `,
}));

function remainingTime(deadline: number, now: number) {
  const totalMinutes = Math.max(0, Math.ceil((deadline - now) / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${hours}h ${minutes}m`;
}

async function postJson<T>(url: string, body: unknown) {
  return requestAccountJson<T>(url, {
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
  const { styles, cx } = useStyles();
  const { locale, t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const deadline = new Date(deletionDueAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<"code" | "restore">();
  const codeCooldown = useVerificationCooldown();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function sendCode() {
    setBusy("code");
    try {
      const challenge = await postJson<{ resendAvailableAt?: string }>(
        "/api/account/deletion/challenge",
        {
          purpose: "restore",
          password,
          locale,
        },
      );
      codeCooldown.startCooldown(challenge.resendAvailableAt);
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
        <div className={styles.introduction}>
          <h1 className={styles.heading}>{t("account.recovery.title")}</h1>
          <p className={styles.description}>{t("account.recovery.description")}</p>
        </div>
        <div className={styles.accountSummary}>
          <p className={styles.identity}>{email}</p>
          <div className={styles.deadline}>
            <strong className={styles.deadlineValue}>{t("account.recovery.remaining", { time: remainingTime(deadline, now) })}</strong>
            <span className={styles.deadlineText}>{t("account.recovery.deadline", { time: deadlineText })}</span>
          </div>
        </div>
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="recovery-password">{t("account.recovery.password")}</label>
            <Input.Password className={styles.control} id="recovery-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {!codeSent ? (
            <Button
              aria-label={t("account.recovery.sendCode")}
              className={styles.control}
              disabled={!password}
              icon={<SafetyCertificateOutlined aria-hidden="true" />}
              loading={busy === "code"}
              onClick={sendCode}
            >
              {t("account.recovery.sendCode")}
            </Button>
          ) : (
            <div className={styles.recoveryRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="recovery-code">{t("account.recovery.code")}</label>
                <div className={styles.verificationInputRow}>
                  <Input className={styles.control} id="recovery-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />
                  <Button
                    aria-label={codeCooldown.remainingSeconds > 0 ? undefined : t("account.recovery.sendCode")}
                    className={styles.control}
                    disabled={codeCooldown.remainingSeconds > 0}
                    icon={<SafetyCertificateOutlined aria-hidden="true" />}
                    loading={busy === "code"}
                    onClick={sendCode}
                  >
                    {codeCooldown.remainingSeconds > 0
                      ? t("common.resendAvailableIn", { seconds: codeCooldown.remainingSeconds })
                      : t("account.email.resendCurrent")}
                  </Button>
                </div>
              </div>
              <Button className={cx(styles.control, styles.recoveryAction)} disabled={code.length !== 6} loading={busy === "restore"} onClick={restore} type="primary">{t("account.recovery.restore")}</Button>
            </div>
          )}
        </div>
        <div className={styles.secondaryActions}>
          <Button aria-label={t("account.export.action")} className={styles.secondaryButton} href={`/api/account/export?locale=${locale}`} icon={<DownloadOutlined aria-hidden="true" />}>{t("account.export.action")}</Button>
          <SignOutButton className={styles.signOut} />
        </div>
      </div>
    </AuthExperienceShell>
  );
}
