"use client";

import { Button, Input, Result } from "antd";
import { createStyles } from "antd-style";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import { authClient } from "@/lib/auth/client";

const useStyles = createStyles(({ token, css }) => ({
  introduction: css`
    margin-bottom: 34px;
  `,
  heading: css`
    margin: 0 0 10px;
    color: ${token.colorText};
    font-size: 28px;
  `,
  lead: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    line-height: 1.7;
  `,
  form: css`
    display: grid;
    gap: 14px;
  `,
  invalid: css`
    display: grid;
    min-height: 360px;
    place-items: center;
  `,
}));

export function AcceptInvitationPanel({
  email,
  token,
}: {
  email: string | null;
  token: string;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);

  if (!email) {
    return (
      <div className={styles.invalid}>
        <Result
          status="warning"
          title={t("invitations.accept.invalidTitle")}
          subTitle={t("invitations.accept.invalidDescription")}
        />
      </div>
    );
  }

  async function submit() {
    if (password !== confirmation) {
      toast.error(t("auth.passwordMismatch"));
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      if (!response.ok) {
        toast.error(t("invitations.accept.failed"));
        return;
      }
      const result = await response.json() as { email: string };
      const signIn = await authClient.signIn.email({
        email: result.email,
        password,
      });
      if (signIn.error) {
        toast.error(t("invitations.accept.signInFailed"));
        return;
      }
      router.replace("/app");
      router.refresh();
    } catch {
      toast.error(t("invitations.accept.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className={styles.introduction}>
        <h1 className={styles.heading}>{t("invitations.accept.title")}</h1>
        <p className={styles.lead}>{t("invitations.accept.description")}</p>
      </div>
      <form className={styles.form} onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}>
        <Input aria-label={t("common.emailAddress")} disabled value={email} />
        <Input
          aria-label={t("common.username")}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
          placeholder={t("common.username")}
          required
          value={name}
        />
        <Input.Password
          aria-label={t("common.password")}
          autoComplete="new-password"
          minLength={12}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("common.password")}
          required
          value={password}
        />
        <Input.Password
          aria-label={t("common.confirmPassword")}
          autoComplete="new-password"
          minLength={12}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={t("common.confirmPassword")}
          required
          value={confirmation}
        />
        <Button block htmlType="submit" loading={pending} type="primary">
          {t("invitations.accept.submit")}
        </Button>
      </form>
    </>
  );
}
