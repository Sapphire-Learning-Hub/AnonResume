"use client";

import { Alert } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { AdminRecoveryCodesPanel } from "@/components/admin/AdminRecoveryCodesPanel";
import { AuthExperienceShell } from "@/components/auth/AuthExperienceShell";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import {
  createAdminTranslator,
  type AdminMessageKey,
} from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

import {
  AdminSetupAccount,
  type AdminSetupAccountValue,
} from "./AdminSetupAccount";
import { AdminSetupClaim } from "./AdminSetupClaim";
import {
  AdminSetupMfa,
  type AdminSetupEnrollment,
} from "./AdminSetupMfa";
import { useAdminSetupStyles } from "./styles";

type SetupMode = "initialization" | "recovery";
type SetupStep = "claim" | "account" | "mfa" | "recovery_codes";

export function AdminSetupWizard({ initialMode }: { initialMode: SetupMode }) {
  const { styles } = useAdminSetupStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState<SetupStep>("claim");
  const [pending, setPending] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [enrollment, setEnrollment] = useState<AdminSetupEnrollment | null>(null);
  const [recovery, setRecovery] = useState<{
    email: string;
    codes: string[];
  } | null>(null);

  const title = mode === "initialization"
    ? t("setup.initializationTitle")
    : t("setup.recoveryTitle");

  async function claim(code: string) {
    setPending(true);
    setSessionExpired(false);
    try {
      const response = await postJson(
        "/api/setup/claim",
        { code },
        setupClaimResponseSchema,
      );
      if (!response.ok) {
        showApiError(response.error);
        return;
      }
      if (response.data.mode === "recovery") setMode("recovery");
      setStep("account");
    } finally {
      setPending(false);
    }
  }

  async function beginAccount(value: AdminSetupAccountValue) {
    setPending(true);
    try {
      const response = await postJson(
        "/api/setup/account",
        value,
        setupEnrollmentResponseSchema,
      );
      if (!response.ok) {
        handleApiFailure(response.error);
        return;
      }
      setPassword(value.password);
      setEnrollment(response.data);
      setStep("mfa");
    } finally {
      setPending(false);
    }
  }

  async function complete(code: string) {
    if (!enrollment) return;
    setPending(true);
    try {
      const response = await postJson(
        "/api/setup/complete",
        {
          deviceId: enrollment.deviceId,
          code,
          password,
        },
        setupCompletionResponseSchema,
      );
      if (!response.ok) {
        handleApiFailure(response.error);
        return;
      }
      const data = response.data;
      setRecovery({ email: data.email, codes: data.recoveryCodes });
      setPassword("");
      setStep("recovery_codes");
    } finally {
      setPending(false);
    }
  }

  function handleApiFailure(error: string) {
    if (error === "setup_session_invalid") {
      setPassword("");
      setEnrollment(null);
      setStep("claim");
      setSessionExpired(true);
      return;
    }
    showApiError(error);
  }

  function showApiError(error: string) {
    const key = setupErrorMessages[error] ?? "setup.errorGeneric";
    toast.error(t(key));
  }

  return (
    <main className="auth-page-shell">
      <AuthExperienceShell>
        <div className={styles.introduction}>
          <h1 className={styles.heroTitle}>{title}</h1>
        </div>
        {sessionExpired ? (
          <Alert
            className={styles.notice}
            description={t("setup.sessionExpiredDescription")}
            showIcon
            title={t("setup.sessionExpiredTitle")}
            type="warning"
          />
        ) : null}
        {step === "claim" ? (
          <>
            <p className={styles.description}>{t("setup.claimDescription")}</p>
            <AdminSetupClaim onSubmit={claim} pending={pending} />
          </>
        ) : null}
        {step === "account" ? (
          <>
            <h2 className={styles.title}>{t("setup.accountTitle")}</h2>
            <AdminSetupAccount
              onPasswordMismatch={() => toast.error(t("setup.passwordMismatch"))}
              onSubmit={beginAccount}
              pending={pending}
            />
          </>
        ) : null}
        {step === "mfa" && enrollment ? (
          <>
            <h2 className={styles.title}>{t("setup.mfaTitle")}</h2>
            <p className={styles.description}>{t("setup.mfaDescription")}</p>
            <AdminSetupMfa
              enrollment={enrollment}
              onSubmit={complete}
              pending={pending}
            />
          </>
        ) : null}
        {step === "recovery_codes" && recovery ? (
          <AdminRecoveryCodesPanel
            codes={recovery.codes}
            continueLabel={t("setup.goToSignIn")}
            email={recovery.email}
            onContinue={() => {
              router.replace("/sign-in");
              router.refresh();
            }}
          />
        ) : null}
      </AuthExperienceShell>
    </main>
  );
}

const setupErrorMessages: Record<string, AdminMessageKey> = {
  invalid_request: "setup.errorInvalidRequest",
  setup_code_invalid: "setup.errorCodeInvalid",
  setup_claim_rate_limited: "setup.errorRateLimited",
  setup_email_conflict: "setup.errorEmailConflict",
  setup_password_invalid: "setup.errorPasswordInvalid",
  setup_mfa_invalid: "setup.errorMfaInvalid",
  setup_mfa_locked: "setup.errorMfaLocked",
  setup_already_completed: "setup.errorAlreadyCompleted",
};

const setupClaimResponseSchema = z.object({
  mode: z.enum(["initialization", "recovery"]),
});

const setupEnrollmentResponseSchema = z.object({
  email: z.email(),
  deviceId: z.uuid(),
  secret: z.string().min(1),
  uri: z.string().startsWith("otpauth://"),
});

const setupCompletionResponseSchema = z.object({
  email: z.email(),
  recoveryCodes: z.array(z.string().min(1)).min(1),
});

async function postJson<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      return {
        ok: false as const,
        error: String(data.error ?? "internal_error"),
      };
    }
    const parsed = schema.safeParse(data);
    return parsed.success
      ? { ok: true as const, data: parsed.data }
      : { ok: false as const, error: "internal_error" };
  } catch {
    return { ok: false as const, error: "internal_error" };
  }
}
