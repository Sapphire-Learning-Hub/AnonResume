"use client";

import { Alert, Button, Input } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

const useStyles = createStyles(({ css }) => ({
  form: css`
    display: grid;
    gap: 12px;
  `,
}));

export interface ManagementMfaChallengeResult {
  recoveryRequired: boolean;
}

export function ManagementMfaChallenge({
  onSuccess,
}: {
  onSuccess: (result: ManagementMfaChallengeResult) => void;
  presentation: "inline" | "modal";
}) {
  const { styles } = useStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const [code, setCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/manage/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as {
        error?: string;
        recoveryRequired?: boolean;
      };
      if (!response.ok) {
        setError(
          body.error === "mfa_locked"
            ? t("auth.mfaLocked")
            : t("common.invalidCode"),
        );
        return;
      }
      onSuccess({ recoveryRequired: body.recoveryRequired === true });
    } catch {
      setError(t("auth.mfaFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      {error ? <Alert message={error} showIcon type="error" /> : null}
      {recoveryMode ? (
        <Input
          autoFocus
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
          value={code}
        />
      ) : (
        <AdminOtpInput autoFocus onChange={setCode} value={code} />
      )}
      <Button
        disabled={
          recoveryMode
            ? !/^[A-F0-9]{4}(?:-[A-F0-9]{4}){4}$/.test(code)
            : code.length !== 6
        }
        htmlType="submit"
        loading={pending}
        size="large"
        type="primary"
      >
        {t("auth.enterConsole")}
      </Button>
      <Button
        onClick={() => {
          setCode("");
          setRecoveryMode((current) => !current);
        }}
        type="link"
      >
        {recoveryMode ? t("auth.useTotp") : t("auth.useRecovery")}
      </Button>
    </form>
  );
}
