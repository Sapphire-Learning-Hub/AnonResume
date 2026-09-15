"use client";

import { Button, Input } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { AdminRecoveryCodesPanel } from "@/components/admin/AdminRecoveryCodesPanel";
import { ManagementMfaChallenge } from "@/components/admin/ManagementMfaChallenge";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

const useStyles = createStyles(({ token, css }) => ({
  page: css`
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 32px 20px;
    background:
      radial-gradient(circle at 15% 15%, color-mix(in srgb, ${token.colorPrimary} 13%, transparent), transparent 34%),
      ${token.colorBgLayout};
  `,
  panel: css`
    width: min(480px, 100%);
    padding: 30px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 24px;
    background: ${token.colorBgContainer};
    box-shadow: ${token.boxShadowSecondary};
  `,
  logo: css`
    display: block;
    width: 220px;
    height: auto;
    margin: 0 auto 30px;
  `,
  title: css`
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: 28px;
    line-height: 1.2;
  `,
  description: css`
    margin: 10px 0 24px;
    color: ${token.colorTextSecondary};
    line-height: 1.7;
  `,
  form: css`
    display: grid;
    gap: 12px;
  `,
  qr: css`
    display: grid;
    width: fit-content;
    margin: 20px auto;
    padding: 14px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 16px;
    background: #fff;
  `,
  secret: css`
    padding: 10px 12px;
    border-radius: 10px;
    background: ${token.colorFillQuaternary};
    font-family: "Noto Sans Mono Variable", monospace;
    font-size: 13px;
    text-align: center;
    overflow-wrap: anywhere;
  `,
}));

export function AdminAccessShell({ children }: { children: React.ReactNode }) {
  const { styles } = useStyles();
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <AnonResumeLogo
          className={styles.logo}
          loading="eager"
          variant="lockup"
        />
        {children}
      </section>
    </main>
  );
}

export function AdminMfaPanel() {
  const { styles } = useStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();

  return (
    <>
      <h1 className={styles.title}>{t("auth.mfaTitle")}</h1>
      <ManagementMfaChallenge
        onSuccess={({ recoveryRequired }) => {
          router.replace(
            recoveryRequired ? "/app/manage/security" : "/app/manage",
          );
          router.refresh();
        }}
        presentation="inline"
      />
    </>
  );
}

type Enrollment = { deviceId: string; uri: string; secret: string };

export function AdminActivationPanel({
  token,
  email,
  purpose,
  requiresMfa,
}: {
  token: string;
  email: string;
  purpose: "super_admin" | "product_user" | "delegated_admin";
  requiresMfa: boolean;
}) {
  const { styles } = useStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const router = useRouter();
  const { toast } = useAppFeedback();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deviceName, setDeviceName] = useState(() =>
    t("security.defaultDeviceName"),
  );
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error(t("activation.passwordMismatch"));
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/manage/activation/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password, deviceName }),
      });
      if (!response.ok) {
        toast.error(t("activation.invalid"));
        return;
      }
      const body = (await response.json()) as
        | { completed: true }
        | ({ completed: false } & Enrollment);
      if (body.completed) {
        router.replace("/sign-in?verified=1");
        return;
      }
      setEnrollment(body);
    } catch {
      toast.error(t("activation.startFailed"));
    } finally {
      setPending(false);
    }
  }

  async function complete(event: React.FormEvent) {
    event.preventDefault();
    if (!enrollment) return;
    setPending(true);
    try {
      const response = await fetch("/api/manage/activation/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          deviceId: enrollment.deviceId,
          code,
          password,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        recoveryCodes?: string[];
      };
      if (!response.ok) {
        toast.error(
          body.error === "mfa_locked"
            ? t("auth.mfaLocked")
            : t("common.invalidCode"),
        );
        return;
      }
      if (!body.recoveryCodes) {
        toast.error(t("activation.completeFailed"));
        return;
      }
      setRecoveryCodes(body.recoveryCodes);
    } catch {
      toast.error(t("activation.completeFailed"));
    } finally {
      setPending(false);
    }
  }

  if (recoveryCodes) {
    return (
      <AdminRecoveryCodesPanel
        codes={recoveryCodes}
        email={email}
        onContinue={() => router.replace("/sign-in")}
      />
    );
  }

  if (enrollment) {
    return (
      <>
        <h1 className={styles.title}>{t("activation.bindMfa")}</h1>
        <p className={styles.description}>
          {t("activation.bindMfaDescription")}
        </p>
        <div className={styles.qr}>
          <QRCodeSVG size={190} value={enrollment.uri} />
        </div>
        <p className={styles.secret}>{enrollment.secret}</p>
        <form className={styles.form} onSubmit={complete}>
          <AdminOtpInput onChange={setCode} value={code} />
          <Button
            disabled={code.length !== 6}
            htmlType="submit"
            loading={pending}
            size="large"
            type="primary"
          >
            {t("activation.complete")}
          </Button>
        </form>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>
        {purpose === "super_admin" ? t("activation.superAdmin") : t("activation.invited")}
      </h1>
      <p className={styles.description}>
        {purpose === "super_admin"
          ? t("activation.superAdminDescription", { email })
          : t("activation.invitedDescription", { email })}
      </p>
      <form className={styles.form} onSubmit={start}>
        <Input.Password
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("activation.password")}
          size="large"
          value={password}
        />
        <Input.Password
          autoComplete="new-password"
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder={t("activation.confirmPassword")}
          size="large"
          value={confirmPassword}
        />
        {requiresMfa ? (
          <Input
            onChange={(event) => setDeviceName(event.target.value)}
            placeholder={t("activation.deviceName")}
            size="large"
            value={deviceName}
          />
        ) : null}
        <Button htmlType="submit" loading={pending} size="large" type="primary">
          {requiresMfa ? t("activation.passwordAndMfa") : t("activation.account")}
        </Button>
      </form>
    </>
  );
}
