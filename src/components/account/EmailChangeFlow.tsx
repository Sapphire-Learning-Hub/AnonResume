"use client";

import { Button, Input } from "antd";
import { useState } from "react";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useVerificationCooldown } from "@/components/ui/useVerificationCooldown";
import { useI18n } from "@/i18n/I18nProvider";

import {
  accountRequestErrorMessage,
  requestAccountJson,
} from "./account-request";
import { useAccountCenterStyles } from "./AccountCenter.style";

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function EmailChangeFlow({
  hasPassword,
  onEmailChanged,
}: {
  hasPassword: boolean;
  onEmailChanged: (email: string) => void;
}) {
  const { styles } = useAccountCenterStyles();
  const { locale, t } = useI18n();
  const { toast } = useAppFeedback();
  const [busy, setBusy] = useState<string>();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentEmailCode, setCurrentEmailCode] = useState("");
  const [newEmailCode, setNewEmailCode] = useState("");
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [newEmailCodeSent, setNewEmailCodeSent] = useState(false);
  const currentEmailCooldown = useVerificationCooldown();
  const newEmailCooldown = useVerificationCooldown();

  async function runOperation(
    key: string,
    operation: () => Promise<void>,
    success: string,
  ) {
    setBusy(key);
    try {
      await operation();
      toast.success(success);
    } catch (error) {
      toast.error({
        key: "account-action-error",
        content: accountRequestErrorMessage(error, t),
      });
    } finally {
      setBusy(undefined);
    }
  }

  async function sendEmailCode(stage: "old" | "new") {
    await runOperation(`email-${stage}`, async () => {
      const challenge = await requestAccountJson<{
        resendAvailableAt?: string;
      }>(
        "/api/account/email/challenge",
        jsonRequest("POST", {
          stage,
          ...(stage === "old"
            ? { currentPassword }
            : { newEmail, oldEmailCode: currentEmailCode }),
          locale,
        }),
      );
      const cooldown = stage === "old"
        ? currentEmailCooldown
        : newEmailCooldown;
      cooldown.startCooldown(challenge.resendAvailableAt);
      if (stage === "old") {
        setStep(1);
      } else {
        setNewEmailCodeSent(true);
      }
    }, t("account.email.codeSent"));
  }

  async function verifyCurrentEmail() {
    await runOperation("email-old-verify", async () => {
      await requestAccountJson(
        "/api/account/email/challenge",
        jsonRequest("PUT", { code: currentEmailCode }),
      );
      setStep(2);
    }, t("account.email.currentVerified"));
  }

  async function changeEmail() {
    await runOperation("email-change", async () => {
      await requestAccountJson("/api/account/email", jsonRequest("POST", {
        currentPassword,
        newEmail,
        oldEmailCode: currentEmailCode,
        newEmailCode,
        locale,
      }));
      onEmailChanged(newEmail);
      setCurrentPassword("");
      setNewEmail("");
      setCurrentEmailCode("");
      setNewEmailCode("");
      setStep(0);
      setNewEmailCodeSent(false);
      currentEmailCooldown.resetCooldown();
      newEmailCooldown.resetCooldown();
    }, t("account.email.changed"));
  }

  if (!hasPassword) {
    return <p className={styles.muted}>{t("account.security.passwordRequired")}</p>;
  }

  const stepLabels = [
    t("account.email.stepPassword"),
    t("account.email.stepCurrent"),
    t("account.email.stepNew"),
  ];

  return (
    <div className={styles.emailFlow}>
      <ol aria-label={t("account.email.progress")} className={styles.emailSteps}>
        {stepLabels.map((label, index) => (
          <li
            className={styles.emailStep}
            data-state={index === step ? "current" : index < step ? "complete" : "upcoming"}
            key={label}
          >
            <span className={styles.emailStepNumber}>{index + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <div className={styles.formPanel}>
        {step === 0 ? (
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="account-email-password">{t("account.email.password")}</label>
              <Input.Password id="account-email-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            </div>
            <div className={styles.actionRow}>
              <Button disabled={!currentPassword || currentEmailCooldown.remainingSeconds > 0} loading={busy === "email-old"} onClick={() => sendEmailCode("old")} type="primary">
                {currentEmailCooldown.remainingSeconds > 0
                  ? t("common.resendAvailableIn", { seconds: currentEmailCooldown.remainingSeconds })
                  : t("account.email.verifyPassword")}
              </Button>
            </div>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="account-old-email-code">{t("account.email.oldCode")}</label>
              <div className={styles.verificationInputRow}>
                <Input id="account-old-email-code" inputMode="numeric" maxLength={6} value={currentEmailCode} onChange={(event) => setCurrentEmailCode(event.target.value)} />
                <Button disabled={currentEmailCooldown.remainingSeconds > 0} loading={busy === "email-old"} onClick={() => sendEmailCode("old")}>
                  {currentEmailCooldown.remainingSeconds > 0
                    ? t("common.resendAvailableIn", { seconds: currentEmailCooldown.remainingSeconds })
                    : t("account.email.resendCurrent")}
                </Button>
              </div>
            </div>
            <div className={styles.actionRow}><Button disabled={currentEmailCode.length !== 6} loading={busy === "email-old-verify"} onClick={verifyCurrentEmail} type="primary">{t("account.email.verifyCurrent")}</Button></div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="account-new-email">{t("account.email.new")}</label>
              <Input disabled={newEmailCodeSent} id="account-new-email" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
            </div>
            {newEmailCodeSent ? (
              <>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="account-new-email-code">{t("account.email.newCode")}</label>
                  <div className={styles.verificationInputRow}>
                    <Input id="account-new-email-code" inputMode="numeric" maxLength={6} value={newEmailCode} onChange={(event) => setNewEmailCode(event.target.value)} />
                    <Button disabled={newEmailCooldown.remainingSeconds > 0} loading={busy === "email-new"} onClick={() => sendEmailCode("new")}>
                      {newEmailCooldown.remainingSeconds > 0
                        ? t("common.resendAvailableIn", { seconds: newEmailCooldown.remainingSeconds })
                        : t("account.email.sendNew")}
                    </Button>
                  </div>
                </div>
                <div className={styles.actionRow}><Button disabled={newEmailCode.length !== 6} loading={busy === "email-change"} onClick={changeEmail} type="primary">{t("account.email.change")}</Button></div>
              </>
            ) : (
              <div className={styles.actionRow}><Button disabled={!newEmail} loading={busy === "email-new"} onClick={() => sendEmailCode("new")} type="primary">{t("account.email.sendNew")}</Button></div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
