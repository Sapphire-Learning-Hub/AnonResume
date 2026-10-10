"use client";

import { Button, Input, Spin } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthExperienceShell } from "@/components/auth/AuthExperienceShell";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useVerificationCooldown } from "@/components/ui/useVerificationCooldown";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";
import { authClient } from "@/lib/auth/client";
import type { SocialRegistrationIntentView } from "@/lib/auth/social-registration/types";

const useStyles = createStyles(({ token, css }) => ({
  heading: css`
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: 26px;
    line-height: 1.2;
    letter-spacing: -0.025em;
  `,
  description: css`
    margin: 10px 0 0;
    color: ${token.colorTextSecondary};
    font-size: 14px;
    line-height: 1.7;
  `,
  loading: css`
    display: grid;
    flex: 1;
    place-items: center;
  `,
  form: css`
    display: grid;
    gap: 16px;
    margin-top: 34px;

    && .ant-input,
    && .ant-input-affix-wrapper,
    && .ant-btn {
      min-height: 42px;
      border-radius: 10px;
    }

    && .ant-input-affix-wrapper .ant-input {
      min-height: auto;
    }
  `,
  field: css`
    display: grid;
    gap: 8px;
  `,
  label: css`
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 600;
  `,
  compactField: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;

    && > .ant-input,
    && > .ant-input-affix-wrapper {
      border-start-end-radius: 0;
      border-end-end-radius: 0;
    }

    && > .ant-btn {
      border-start-start-radius: 0;
      border-end-start-radius: 0;
    }
  `,
  actions: css`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 8px;
  `,
  status: css`
    display: grid;
    flex: 1;
    align-content: center;
    justify-items: center;
    text-align: center;
  `,
  statusDescription: css`
    max-width: 340px;
    margin: 12px 0 24px;
    color: ${token.colorTextSecondary};
    font-size: 14px;
    line-height: 1.7;
  `,
}));

type ViewState = "loading" | "form" | "expired" | "conflict" | "created";

const errorMessages: Readonly<Record<string, MessageKey>> = {
  email_attempts_exhausted:
    "auth.socialRegistration.error.emailAttemptsExhausted",
  email_code_expired: "auth.socialRegistration.error.codeExpired",
  email_code_invalid: "auth.socialRegistration.error.codeInvalid",
  email_conflict: "auth.socialRegistration.error.emailConflict",
  email_invalid: "auth.socialRegistration.error.emailInvalid",
  email_resend_too_soon: "auth.socialRegistration.error.resendTooSoon",
  password_invalid: "auth.invalidPassword",
};

function isIntent(value: unknown): value is SocialRegistrationIntentView {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SocialRegistrationIntentView>;
  return (
    (candidate.state === "password" || candidate.state === "email") &&
    typeof candidate.displayName === "string" &&
    (candidate.email === null || typeof candidate.email === "string") &&
    (candidate.imageUrl === null || typeof candidate.imageUrl === "string")
  );
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function getErrorCode(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return null;
}

export function SocialRegistrationPanel({
  announcements = [],
}: {
  announcements?: readonly LocalizedAnnouncement[];
}) {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const [view, setView] = useState<ViewState>("loading");
  const [intent, setIntent] = useState<SocialRegistrationIntentView | null>(
    null,
  );
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const { remainingSeconds, startCooldown } = useVerificationCooldown();

  useEffect(() => {
    let active = true;

    async function loadIntent() {
      try {
        const response = await fetch("/api/registration/social/intent", {
          cache: "no-store",
        });
        const payload = await readJson(response);
        if (!active) return;
        if (!response.ok || !isIntent(payload)) {
          const code = getErrorCode(payload);
          setView(code === "account_conflict" ? "conflict" : "expired");
          return;
        }
        setIntent(payload);
        setDisplayName(payload.displayName);
        setEmail(payload.email ?? "");
        setView("form");
      } catch {
        if (active) setView("expired");
      }
    }

    void loadIntent();
    return () => {
      active = false;
    };
  }, []);

  function handleApiError(payload: unknown) {
    const code = getErrorCode(payload);
    if (code === "intent_expired" || code === "intent_invalid") {
      setView("expired");
      return;
    }
    if (code === "account_conflict" || code === "email_conflict") {
      setView("conflict");
      return;
    }
    toast.error(t((code && errorMessages[code]) || "auth.errorFallback"));
  }

  async function sendCode() {
    if (!email || isPending || remainingSeconds > 0) return;
    setIsPending(true);
    try {
      const response = await fetch(
        "/api/registration/social/email/challenge",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, locale }),
        },
      );
      const payload = await readJson(response);
      if (!response.ok) {
        handleApiError(payload);
        return;
      }
      const retryAfterSeconds =
        payload &&
        typeof payload === "object" &&
        "retryAfterSeconds" in payload &&
        typeof payload.retryAfterSeconds === "number"
          ? payload.retryAfterSeconds
          : 60;
      startCooldown(
        new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
      );
      setCodeRequested(true);
      toast.success(t("auth.socialRegistration.emailCodeSent"));
    } catch {
      toast.error(t("auth.errorFallback"));
    } finally {
      setIsPending(false);
    }
  }

  async function verifyEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setIsPending(true);
    try {
      const response = await fetch("/api/registration/social/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        handleApiError(payload);
        return;
      }
      const verifiedEmail =
        payload &&
        typeof payload === "object" &&
        "email" in payload &&
        typeof payload.email === "string"
          ? payload.email
          : null;
      if (!verifiedEmail || !intent) {
        toast.error(t("auth.errorFallback"));
        return;
      }
      setEmail(verifiedEmail);
      setIntent({ ...intent, state: "password", email: verifiedEmail });
      setCode("");
    } catch {
      toast.error(t("auth.errorFallback"));
    } finally {
      setIsPending(false);
    }
  }

  async function completeRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !intent?.email) return;
    if (password !== confirmPassword) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }

    setIsPending(true);
    let accountCreated = false;
    try {
      const response = await fetch("/api/registration/social/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, password }),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        handleApiError(payload);
        return;
      }
      const createdEmail =
        payload &&
        typeof payload === "object" &&
        "email" in payload &&
        typeof payload.email === "string"
          ? payload.email
          : null;
      if (!createdEmail) {
        toast.error(t("auth.errorFallback"));
        return;
      }
      accountCreated = true;

      const signIn = await authClient.signIn.email({
        email: createdEmail,
        password,
        callbackURL: "/app",
      });
      if (signIn.error) {
        setView("created");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      if (accountCreated) {
        setView("created");
      } else {
        toast.error(t("auth.errorFallback"));
      }
    } finally {
      setIsPending(false);
    }
  }

  const status = view === "expired"
    ? {
        title: t("auth.socialRegistration.expiredHeading"),
        description: t("auth.socialRegistration.expiredDescription"),
      }
    : view === "conflict"
      ? {
          title: t("auth.socialRegistration.conflictHeading"),
          description: t("auth.socialRegistration.conflictDescription"),
        }
      : view === "created"
        ? {
            title: t("auth.socialRegistration.createdHeading"),
            description: t("auth.socialRegistration.createdDescription"),
          }
        : null;

  return (
    <AuthExperienceShell announcements={announcements}>
      {view === "loading" ? (
        <div className={styles.loading}>
          <Spin aria-label={t("auth.socialRegistration.loading")} />
        </div>
      ) : status ? (
        <div className={styles.status}>
          <h1 className={styles.heading}>{status.title}</h1>
          <p className={styles.statusDescription}>{status.description}</p>
          <Button type="primary" onClick={() => router.push("/sign-in")}>
            {t("auth.backToSignIn")}
          </Button>
        </div>
      ) : intent ? (
        <>
          <h1 className={styles.heading}>
            {intent.state === "email"
              ? t("auth.socialRegistration.emailHeading")
              : t("auth.socialRegistration.heading")}
          </h1>
          <p className={styles.description}>
            {intent.state === "email"
              ? t("auth.socialRegistration.emailLead")
              : t("auth.socialRegistration.lead")}
          </p>

          {intent.state === "email" ? (
            <form className={styles.form} onSubmit={verifyEmail}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="social-email">
                  {t("common.emailAddress")}
                </label>
                <div className={styles.compactField}>
                  <Input
                    id="social-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    readOnly={codeRequested}
                    required
                  />
                  <Button
                    htmlType="button"
                    onClick={() => void sendCode()}
                    loading={isPending && !codeRequested}
                    disabled={remainingSeconds > 0}
                  >
                    {codeRequested && remainingSeconds > 0
                      ? t("common.resendAvailableIn", {
                          seconds: remainingSeconds,
                        })
                      : codeRequested
                        ? t("auth.socialRegistration.resendCode")
                        : t("auth.socialRegistration.sendCode")}
                  </Button>
                </div>
              </div>
              {codeRequested ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="social-code">
                      {t("auth.socialRegistration.emailCode")}
                    </label>
                    <Input
                      id="social-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      autoComplete="one-time-code"
                      required
                    />
                  </div>
                  <div className={styles.actions}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={isPending}
                    >
                      {t("auth.socialRegistration.verifyEmail")}
                    </Button>
                  </div>
                </>
              ) : null}
            </form>
          ) : (
            <form className={styles.form} onSubmit={completeRegistration}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="social-display-name">
                  {t("auth.socialRegistration.displayName")}
                </label>
                <Input
                  id="social-display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  maxLength={80}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="social-login-email">
                  {t("auth.socialRegistration.loginEmail")}
                </label>
                <Input
                  id="social-login-email"
                  type="email"
                  value={intent.email ?? email}
                  readOnly
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="social-password">
                  {t("common.password")}
                </label>
                <Input.Password
                  id="social-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="social-confirm-password">
                  {t("common.confirmPassword")}
                </label>
                <Input.Password
                  id="social-confirm-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
              <div className={styles.actions}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={isPending}
                >
                  {t("common.createAccount")}
                </Button>
              </div>
            </form>
          )}
        </>
      ) : null}
    </AuthExperienceShell>
  );
}
