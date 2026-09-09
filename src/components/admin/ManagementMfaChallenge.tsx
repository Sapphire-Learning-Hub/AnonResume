"use client";

import { Button, Input } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

const useStyles = createStyles(({ css }) => ({
  alternatives: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;

    > button:first-child {
      justify-self: start;
      padding-inline-start: 0;
    }

    > button:last-child {
      justify-self: end;
      padding-inline-end: 0;
    }
  `,
  form: css`
    display: grid;
    gap: 12px;
  `,
}));

export interface ManagementMfaChallengeResult {
  recoveryRequired: boolean;
}

export function ManagementMfaChallenge({
  onRequestReset,
  onSuccess,
}: {
  onRequestReset?: () => void;
  onSuccess: (result: ManagementMfaChallengeResult) => void;
  presentation: "inline" | "modal";
}) {
  const { styles } = useStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const { toast } = useAppFeedback();
  const [code, setCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
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
        toast.error(
          body.error === "mfa_locked"
            ? t("auth.mfaLocked")
            : t("common.invalidCode"),
        );
        return;
      }
      onSuccess({ recoveryRequired: body.recoveryRequired === true });
    } catch {
      toast.error(t("auth.mfaFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
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
      {onRequestReset ? (
        <div
          className={styles.alternatives}
          data-testid="management-auth-alternatives"
        >
          <Button
            htmlType="button"
            onClick={() => {
              setCode("");
              setRecoveryMode((current) => !current);
            }}
            type="link"
          >
            {recoveryMode ? t("auth.useTotp") : t("auth.useRecovery")}
          </Button>
          <Button
            htmlType="button"
            onClick={onRequestReset}
            type="link"
          >
            {t("mfaReset.open")}
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => {
            setCode("");
            setRecoveryMode((current) => !current);
          }}
          type="link"
        >
          {recoveryMode ? t("auth.useTotp") : t("auth.useRecovery")}
        </Button>
      )}
    </form>
  );
}
