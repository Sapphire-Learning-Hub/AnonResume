"use client";

import { QRCodeSVG } from "qrcode.react";

import { AdminOtpInput } from "@/components/admin/AdminOtpInput";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

export interface AdminMfaEnrollment {
  deviceId: string;
  uri: string;
  secret: string;
}

export function AdminMfaEnrollmentContent({
  code,
  enrollment,
  onCodeChange,
}: {
  code: string;
  enrollment: AdminMfaEnrollment;
  onCodeChange: (code: string) => void;
}) {
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);

  return (
    <div className="admin-mfa-enrollment">
      <p className="admin-mfa-enrollment__description">
        <span className="admin-mfa-enrollment__description-line">
          {t("security.scanDescription")}
        </span>
        <span className="admin-mfa-enrollment__description-line">
          {t("security.authenticatorRecommendation")}
        </span>
      </p>
      <section className="admin-mfa-enrollment__section">
        <h3 className="admin-mfa-enrollment__label">
          {t("security.qrLabel")}
        </h3>
        <div className="admin-mfa-enrollment__qr">
          <QRCodeSVG
            aria-label={t("security.qrLabel")}
            role="img"
            size={190}
            value={enrollment.uri}
          />
        </div>
      </section>
      <section className="admin-mfa-enrollment__section">
        <h3 className="admin-mfa-enrollment__label">
          {t("security.secretLabel")}
        </h3>
        <code className="admin-mfa-enrollment__secret">
          {enrollment.secret}
        </code>
      </section>
      <section className="admin-mfa-enrollment__section admin-mfa-enrollment__otp">
        <h3 className="admin-mfa-enrollment__label">
          {t("security.codeLabel")}
        </h3>
        <AdminOtpInput onChange={onCodeChange} value={code} />
      </section>
    </div>
  );
}
