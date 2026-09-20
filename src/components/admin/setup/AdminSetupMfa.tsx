"use client";

import { Button } from "antd";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

import { useAdminSetupStyles } from "./styles";

export interface AdminSetupEnrollment {
  email: string;
  deviceId: string;
  secret: string;
  uri: string;
}

export function AdminSetupMfa({
  enrollment,
  pending,
  onSubmit,
}: {
  enrollment: AdminSetupEnrollment;
  pending: boolean;
  onSubmit: (code: string) => Promise<void>;
}) {
  const { styles } = useAdminSetupStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const [code, setCode] = useState("");

  return (
    <>
      <div className={styles.qr}>
        <QRCodeSVG
          size={196}
          title={t("setup.mfaQrTitle")}
          value={enrollment.uri}
        />
      </div>
      <p className={styles.secret}>{enrollment.secret}</p>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(code);
        }}
      >
        <label className={styles.field}>
          {t("setup.otp")}
          <AdminOtpInput
            aria-label={t("setup.otp")}
            onChange={setCode}
            value={code}
          />
        </label>
        <Button
          disabled={code.length !== 6}
          htmlType="submit"
          loading={pending}
          size="large"
          type="primary"
        >
          {t("setup.complete")}
        </Button>
      </form>
    </>
  );
}
