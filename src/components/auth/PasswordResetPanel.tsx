"use client";

import { Button, Input } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { AuthExperienceShell } from "@/components/auth/AuthExperienceShell";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import { authClient } from "@/lib/auth/client";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";

const useStyles = createStyles(({ token, css }) => ({
  heading: css`
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: 26px;
    line-height: 1.2;
  `,
  description: css`
    margin: 10px 0 0;
    color: ${token.colorTextSecondary};
    font-size: 14px;
    line-height: 1.7;
  `,
  form: css`
    display: grid;
    gap: 14px;
    margin-top: 34px;

    && .ant-input-affix-wrapper {
      min-height: 42px;
      border-radius: 10px;
    }

    && .ant-btn {
      height: 42px;
      border-radius: 10px;
    }
  `,
  back: css`
    && {
      display: block;
      height: auto;
      margin: 24px auto 0;
      padding: 0 8px;
      color: ${token.colorTextSecondary};
      font-size: 13px;
    }

    &&:hover {
      color: ${token.colorPrimary};
    }
  `,
  status: css`
    display: grid;
    flex: 1;
    align-content: center;
    justify-items: center;
    text-align: center;
  `,
}));

export function PasswordResetPanel({
  announcements = [],
  token,
}: {
  announcements?: readonly LocalizedAnnouncement[];
  token: string | null;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isInvalid, setIsInvalid] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || isPending) return;
    if (password !== confirmPassword) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }

    setIsPending(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        if (result.error.code === "INVALID_TOKEN") {
          window.history.replaceState(null, "", "/reset-password");
          setIsInvalid(true);
        } else if (result.error.code === "PASSWORD_TOO_SHORT") {
          toast.error(t("auth.passwordTooShort"));
        } else if (result.error.code === "PASSWORD_TOO_LONG") {
          toast.error(t("auth.passwordTooLong"));
        } else {
          toast.error(t("auth.errorFallback"));
        }
        return;
      }

      window.history.replaceState(null, "", "/reset-password");
      setIsComplete(true);
    } catch {
      toast.error(t("auth.errorFallback"));
    } finally {
      setIsPending(false);
    }
  }

  const invalid = !token || isInvalid;
  return (
    <AuthExperienceShell announcements={announcements}>
      {invalid || isComplete ? (
        <div className={styles.status}>
          <h1 className={styles.heading}>
            {isComplete ? t("auth.resetSuccess") : t("auth.resetInvalid")}
          </h1>
          <p className={styles.description}>
            {isComplete
              ? t("auth.resetSuccessDescription")
              : t("auth.resetInvalidDescription")}
          </p>
          <Button
            className={styles.back}
            type="text"
            onClick={() => router.push("/sign-in")}
          >
            {t("auth.backToSignIn")}
          </Button>
        </div>
      ) : (
        <>
          <h1 className={styles.heading}>{t("auth.resetHeading")}</h1>
          <p className={styles.description}>{t("auth.resetLead")}</p>
          <form className={styles.form} onSubmit={handleSubmit}>
            <Input.Password
              data-testid="reset-password-input"
              placeholder={t("common.password")}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Input.Password
              data-testid="reset-confirm-password-input"
              placeholder={t("common.confirmPassword")}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            <Button
              data-testid="reset-submit"
              type="primary"
              htmlType="submit"
              loading={isPending}
              block
            >
              {t("auth.resetSubmit")}
            </Button>
          </form>
          <Button
            className={styles.back}
            type="text"
            onClick={() => router.push("/sign-in")}
          >
            {t("auth.backToSignIn")}
          </Button>
        </>
      )}
    </AuthExperienceShell>
  );
}
