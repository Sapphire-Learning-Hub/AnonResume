"use client";

import { GithubOutlined, GlobalOutlined } from "@ant-design/icons";
import { Button, Divider, Input, Tooltip } from "antd";
import { createStyles } from "antd-style";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { authClient } from "@/lib/auth/client";

const useStyles = createStyles(({ token, css }) => ({
  experience: css`
    display: grid;
    width: 100%;
    min-height: 100vh;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 24px;
    padding: 30px clamp(28px, 4vw, 64px) 24px;

    @media (max-width: 520px) {
      padding: 20px 18px 18px;
    }
  `,
  topBar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
  `,
  brandLogo: css`
    display: block;
    width: 190px;
    height: auto;
    object-fit: contain;
  `,
  localeButton: css`
    && {
      height: 38px;
      padding-inline: 14px;
      border-color: transparent;
      border-radius: 12px;
      color: ${token.colorTextSecondary};
      background: color-mix(
        in srgb,
        ${token.colorBgContainer} 72%,
        transparent
      );
      box-shadow: none;
    }

    &&:hover {
      border-color: ${token.colorBorderSecondary};
      color: ${token.colorText};
      background: ${token.colorBgContainer};
    }
  `,
  content: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(400px, 460px);
    align-items: center;
    gap: clamp(48px, 8vw, 112px);
    width: min(1080px, 100%);
    margin: 0 auto;

    @media (max-width: 900px) {
      grid-template-columns: minmax(0, 460px);
      justify-content: center;
    }
  `,
  showcase: css`
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    padding: 24px;

    &::before {
      position: absolute;
      width: 78%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: ${token.colorPrimaryBg};
      content: "";
      filter: blur(54px);
      opacity: 0.72;
    }

    @media (max-width: 900px) {
      display: none;
    }
  `,
  showcaseArtwork: css`
    position: relative;
    z-index: 1;
    display: block;
    width: min(500px, 100%);
    height: auto;
    filter: drop-shadow(
      0 28px 42px color-mix(in srgb, ${token.colorText} 12%, transparent)
    );
  `,
  shell: css`
    display: flex;
    min-height: 580px;
    flex-direction: column;
    width: 100%;
    padding: 50px 42px 40px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 26px;
    background: color-mix(in srgb, ${token.colorBgContainer} 94%, transparent);
    box-shadow: 0 24px 64px
      color-mix(in srgb, ${token.colorText} 10%, transparent);
    backdrop-filter: blur(20px);

    @media (max-width: 520px) {
      min-height: 0;
      padding: 32px 24px 28px;
      border-radius: 20px;
    }
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
  lead: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 14px;
    line-height: 1.7;
  `,
  form: css`
    display: grid;
    gap: 14px;
    margin-top: 34px;

    && .ant-input,
    && .ant-input-affix-wrapper {
      min-height: 42px;
      border-radius: 10px;
    }

    && .ant-input-affix-wrapper .ant-input {
      min-height: auto;
    }

    && .ant-btn {
      height: 42px;
      border-radius: 10px;
    }
  `,
  modeSwitch: css`
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
  disabledProviderAction: css`
    display: block;
    width: 100%;

    && .ant-btn {
      height: 42px;
      border-radius: 10px;
    }
  `,
  providerButton: css`
    && {
      height: 42px;
      border-radius: 10px;
    }
  `,
  providerSection: css`
    margin-top: auto;
    padding-top: 36px;
  `,
  divider: css`
    && {
      margin: 0 0 22px;
      color: ${token.colorTextTertiary};
      font-size: 12px;
    }
  `,
  verificationState: css`
    display: grid;
    flex: 1;
    align-content: center;
    justify-items: center;
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
    background: color-mix(
      in srgb,
      ${token.colorPrimary} 10%,
      ${token.colorBgContainer}
    );
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
  footer: css`
    margin: 0;
    color: ${token.colorTextTertiary};
    font-size: 12px;
    line-height: 1.6;
    text-align: center;
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

const authErrorMessageKeys: Readonly<Record<string, MessageKey>> = {
  ACCOUNT_SUSPENDED: "auth.accountSuspended",
  EMAIL_PASSWORD_DISABLED: "auth.signInUnavailable",
  EMAIL_PASSWORD_SIGN_UP_DISABLED: "auth.signUpUnavailable",
  FAILED_TO_CREATE_SESSION: "auth.sessionCreationFailed",
  FAILED_TO_CREATE_USER: "auth.accountCreationFailed",
  INVALID_EMAIL: "auth.invalidEmail",
  INVALID_EMAIL_OR_PASSWORD: "auth.invalidCredentials",
  INVALID_PASSWORD: "auth.invalidPassword",
  PASSWORD_TOO_LONG: "auth.passwordTooLong",
  PASSWORD_TOO_SHORT: "auth.passwordTooShort",
  PROVIDER_NOT_FOUND: "auth.socialSignInUnavailable",
  TOO_MANY_REQUESTS: "auth.rateLimited",
};

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
  t: (key: MessageKey) => string,
) {
  const code = getAuthErrorCode(error);
  return t((code && authErrorMessageKeys[code]) || "auth.errorFallback");
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
  const { locale, setLocale, t } = useI18n();
  const { notification, toast } = useAppFeedback();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null,
  );
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
          toast.error(getAuthFeedbackMessage(result.error, t));
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

          toast.error(getAuthFeedbackMessage(result.error, t));
          return;
        }
      }

      router.push("/sign-in");
      router.refresh();
    } catch (error) {
      toast.error(getAuthFeedbackMessage(error, t));
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
        toast.error(getAuthFeedbackMessage(result.error, t));
      }
    } catch (error) {
      toast.error(getAuthFeedbackMessage(error, t));
      setIsPending(false);
    }
  }

  return (
    <section className={styles.experience} data-auth-experience="true">
      <header className={styles.topBar}>
        <AnonResumeLogo
          className={styles.brandLogo}
          loading="eager"
          variant="lockup"
        />
        <Button
          className={styles.localeButton}
          icon={<GlobalOutlined />}
          onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}
        >
          {locale === "zh-CN" ? "English" : "简体中文"}
        </Button>
      </header>

      <div className={styles.content}>
        <div className={styles.showcase} aria-hidden="true">
          <Image
            alt=""
            className={styles.showcaseArtwork}
            height={800}
            preload
            src="/auth/document-review.svg"
            unoptimized
            width={845}
          />
        </div>

        <section className={styles.shell}>
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
                    ? t("auth.resendVerificationCountdown", {
                        seconds: resendSeconds,
                      })
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
              <div className={styles.introduction}>
                <h1 className={styles.heading}>
                  {mode === "sign-up"
                    ? t("auth.signUpHeading")
                    : t("auth.heading")}
                </h1>
                <p className={styles.lead}>
                  {mode === "sign-up" ? t("auth.signUpLead") : t("auth.lead")}
                </p>
              </div>
              <form
                className={styles.form}
                onSubmit={handleSubmit}
                data-testid="auth-form"
              >
                {mode === "sign-up" ? (
                  <Input
                    data-testid="auth-name-input"
                    placeholder={t("common.username")}
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
                  autoComplete={
                    mode === "sign-up" ? "new-password" : "current-password"
                  }
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
                      ? t("auth.resendVerificationCountdown", {
                          seconds: resendSeconds,
                        })
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
                  {mode === "sign-up"
                    ? t("common.createAccount")
                    : t("common.signIn")}
                </Button>
              </form>

              <div className={styles.providerSection}>
                <Divider className={styles.divider}>{t("common.or")}</Divider>

                {githubEnabled ? (
                  <Button
                    className={styles.providerButton}
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

                <Button
                  className={styles.modeSwitch}
                  data-testid={
                    mode === "sign-up"
                      ? "auth-switch-sign-in"
                      : "auth-switch-sign-up"
                  }
                  type="text"
                  onClick={() =>
                    setMode(mode === "sign-up" ? "sign-in" : "sign-up")
                  }
                >
                  {mode === "sign-up"
                    ? `${t("auth.haveAccount")} ${t("common.signIn")}`
                    : `${t("auth.noAccount")} ${t("common.createAccount")}`}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <p className={styles.footer}>{t("auth.footer")}</p>
    </section>
  );
}
