"use client";

import { GithubOutlined } from "@ant-design/icons";
import { Button, Divider, Input, Tooltip } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import { authClient } from "@/lib/auth-client";

const useStyles = createStyles(({ token, css }) => ({
  shell: css`
    width: min(460px, 100%);
    padding: 28px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 28px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, ${token.colorBgContainer} 98%, transparent),
        color-mix(in srgb, ${token.colorBgLayout} 95%, transparent)
      );
    box-shadow: ${token.boxShadowSecondary};
  `,
  heading: css`
    margin: 0;
    font-size: 34px;
    line-height: 1.05;
    letter-spacing: -0.04em;
  `,
  brand: css`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 0 6px;
  `,
  brandLogo: css`
    display: block;
    width: 250px;
    height: auto;
    object-fit: contain;

    &[data-verification-state="true"] {
      width: 218px;
    }
  `,
  form: css`
    display: grid;
    gap: 12px;
    margin-top: 34px;
  `,
  modeSwitch: css`
    && {
      justify-self: end;
      padding: 0;
      color: ${token.colorTextSecondary};
      font-size: 13px;
    }

    &&:hover {
      color: ${token.colorPrimary};
    }
  `,
  disabledProviderAction: css`
    display: block;
    width: 100%;
  `,
  verificationState: css`
    display: grid;
    justify-items: center;
    margin-top: 22px;
  `,
  verificationStatusIcon: css`
    display: grid;
    width: 68px;
    height: 68px;
    place-items: center;
    margin-bottom: 18px;
    border: 1px solid color-mix(in srgb, ${token.colorPrimary} 26%, transparent);
    border-radius: 50%;
    color: ${token.colorPrimary};
    background: color-mix(in srgb, ${token.colorPrimary} 10%, ${token.colorBgContainer});
    box-shadow: 0 12px 30px
      color-mix(in srgb, ${token.colorPrimary} 14%, transparent);
  `,
  verificationStatusGraphic: css`
    width: 34px;
    height: 34px;
  `,
  verificationTitle: css`
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: 24px;
    line-height: 1.25;
    letter-spacing: -0.025em;
    text-align: center;
  `,
  verificationDescription: css`
    max-width: 340px;
    margin: 10px 0 0;
    color: ${token.colorTextSecondary};
    font-size: 14px;
    line-height: 1.7;
    text-align: center;
  `,
  verificationEmail: css`
    max-width: 100%;
    margin: 18px 0 0;
    padding: 9px 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 999px;
    color: ${token.colorText};
    background: ${token.colorFillQuaternary};
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
    text-align: center;
    overflow-wrap: anywhere;
  `,
  verificationActions: css`
    display: grid;
    width: 100%;
    gap: 8px;
    margin-top: 24px;
  `,
  verificationBack: css`
    && {
      justify-self: center;
      color: ${token.colorTextSecondary};
      font-size: 13px;
    }

    &&:hover {
      color: ${token.colorPrimary};
    }
  `,
}));

type AuthMode = "sign-in" | "sign-up";

const verificationFailureCodes = new Set([
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "USER_NOT_FOUND",
  "INVALID_USER",
  // Keep compatibility with verification links created by older auth versions.
  "invalid_token",
  "token_expired",
]);

function getAuthErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function getAuthFeedbackMessage(
  error: unknown,
  fallback: string,
  suspendedMessage: string,
) {
  return getAuthErrorCode(error) === "ACCOUNT_SUSPENDED"
    ? suspendedMessage
    : fallback;
}

export function AuthPanel({
  githubEnabled,
  verificationError,
}: {
  githubEnabled: boolean;
  verificationError?: string;
}) {
  const { styles } = useStyles();
  const router = useRouter();
  const { t } = useI18n();
  const { notification, toast } = useAppFeedback();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const pageErrorMessage =
    verificationError === "ACCOUNT_SUSPENDED"
      ? t("auth.accountSuspended")
      : verificationError && verificationFailureCodes.has(verificationError)
        ? t("auth.invalidVerificationLink")
        : null;

  useEffect(() => {
    const key = "authentication-page-error";

    if (pageErrorMessage) {
      notification.error({
        duration: false,
        key,
        role: "alert",
        title: pageErrorMessage,
      });
    } else {
      notification.destroy(key);
    }

    return () => notification.destroy(key);
  }, [notification, pageErrorMessage]);

  useEffect(() => {
    return () => notification.destroy("authentication-email-verification");
  }, [notification]);

  useEffect(() => {
    if (resendSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "sign-up" && password !== confirmPassword) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }

    setIsPending(true);

    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL: "/sign-in?verified=1",
        });

        if (result.error) {
          toast.error(
            getAuthFeedbackMessage(
              result.error,
              t("auth.errorFallback"),
              t("auth.accountSuspended"),
            ),
          );
          return;
        }

        setVerificationEmail(email);
        setResendSeconds(60);
        return;
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
          callbackURL: "/sign-in",
        });

        if (result.error) {
          if (getAuthErrorCode(result.error) === "EMAIL_NOT_VERIFIED") {
            setVerificationEmail(email);
            notification.warning({
              duration: false,
              key: "authentication-email-verification",
              role: "alert",
              title: t("auth.verifyBeforeSignIn"),
            });
            return;
          }

          toast.error(
            getAuthFeedbackMessage(
              result.error,
              t("auth.errorFallback"),
              t("auth.accountSuspended"),
            ),
          );
          return;
        }
      }

      router.push("/sign-in");
      router.refresh();
    } catch {
      toast.error(t("auth.errorFallback"));
    } finally {
      setIsPending(false);
    }
  }

  async function handleResendVerification() {
    const targetEmail = verificationEmail || email;

    if (!targetEmail || resendSeconds > 0) {
      return;
    }

    setIsResending(true);

    try {
      const result = await authClient.sendVerificationEmail({
        email: targetEmail,
        callbackURL: "/sign-in?verified=1",
      });

      if (result.error) {
        toast.error(t("auth.resendVerificationFailed"));
        return;
      }

      notification.destroy("authentication-email-verification");
      toast.success(t("auth.verificationResent"));
      setResendSeconds(60);
    } catch {
      toast.error(t("auth.resendVerificationFailed"));
    } finally {
      setIsResending(false);
    }
  }

  async function handleGitHubSignIn() {
    setIsPending(true);

    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/sign-in",
      });

      if (result.error) {
        toast.error(t("auth.errorFallback"));
      }
    } catch {
      toast.error(t("auth.errorFallback"));
      setIsPending(false);
    }
  }

  return (
    <section className={styles.shell}>
      <div className={styles.brand}>
        <AnonResumeLogo
          className={styles.brandLogo}
          data-verification-state={
            mode === "sign-up" && verificationEmail ? "true" : undefined
          }
          loading="eager"
          variant="lockup"
        />
      </div>
      {mode === "sign-up" && verificationEmail ? (
        <div className={styles.verificationState}>
          <div
            className={styles.verificationStatusIcon}
            data-testid="verification-status-icon"
            aria-hidden="true"
          >
            <svg
              className={styles.verificationStatusGraphic}
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="4.5"
                y="6.5"
                width="23"
                height="18"
                rx="5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="m6.5 9 9.5 7 9.5-7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="24.5" cy="23.5" r="5.5" fill="currentColor" />
              <path
                d="m22.1 23.5 1.55 1.55 3.05-3.2"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className={styles.verificationTitle}>
            {t("auth.verificationSent")}
          </h1>
          <p className={styles.verificationDescription}>
            {t("auth.verificationSentDescription")}
          </p>
          <p
            className={styles.verificationEmail}
            data-testid="verification-email"
          >
            {verificationEmail}
          </p>
          <div className={styles.verificationActions}>
            <Button
              type="primary"
              onClick={handleResendVerification}
              loading={isResending}
              disabled={resendSeconds > 0}
              block
            >
              {resendSeconds > 0
                ? t("auth.resendVerificationCountdown", { seconds: resendSeconds })
                : t("auth.resendVerification")}
            </Button>
            <Button
              className={styles.verificationBack}
              type="text"
              onClick={() => {
                notification.destroy("authentication-email-verification");
                setMode("sign-in");
                setVerificationEmail(null);
                setResendSeconds(0);
              }}
            >
              {t("auth.backToSignIn")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <form className={styles.form} onSubmit={handleSubmit} data-testid="auth-form">
        {mode === "sign-up" ? (
          <Input
            data-testid="auth-name-input"
            placeholder={t("common.displayName")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
          />
        ) : null}
        <Input
          data-testid="auth-email-input"
          type="email"
          placeholder={t("common.emailAddress")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <Input.Password
          data-testid="auth-password-input"
          placeholder={t("common.password")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required
        />
        {mode === "sign-up" ? (
          <Input.Password
            data-testid="auth-confirm-password-input"
            placeholder={t("common.confirmPassword")}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        ) : null}
        {verificationEmail && mode === "sign-in" ? (
          <Button
            onClick={handleResendVerification}
            loading={isResending}
            disabled={resendSeconds > 0}
            block
          >
            {resendSeconds > 0
              ? t("auth.resendVerificationCountdown", { seconds: resendSeconds })
              : t("auth.resendVerification")}
          </Button>
        ) : null}
        <Button
          data-testid="auth-submit"
          type="primary"
          htmlType="submit"
          loading={isPending}
          block
        >
          {mode === "sign-up" ? t("common.createAccount") : t("common.signIn")}
        </Button>
        <Button
          className={styles.modeSwitch}
          data-testid={
            mode === "sign-up" ? "auth-switch-sign-in" : "auth-switch-sign-up"
          }
          type="text"
          onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}
        >
          {mode === "sign-up"
            ? `${t("auth.haveAccount")} ${t("common.signIn")}`
            : `${t("auth.noAccount")} ${t("common.createAccount")}`}
        </Button>
          </form>

          <Divider>{t("common.or")}</Divider>

          {githubEnabled ? (
            <Button
              icon={<GithubOutlined />}
              onClick={handleGitHubSignIn}
              loading={isPending}
              block
            >
              {t("common.continueWithGitHub")}
            </Button>
          ) : (
            <Tooltip title={t("auth.githubDisabled")}>
              <span className={styles.disabledProviderAction}>
                <Button icon={<GithubOutlined />} disabled block>
                  {t("common.continueWithGitHub")}
                </Button>
              </span>
            </Tooltip>
          )}
        </>
      )}
    </section>
  );
}
