"use client";

import { Button, Input } from "antd";
import { useState } from "react";

import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

import { useAdminSetupStyles } from "./styles";

export function AdminSetupClaim({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (code: string) => Promise<void>;
}) {
  const { styles } = useAdminSetupStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const [code, setCode] = useState("");

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(code);
      }}
    >
      <label className={styles.field} htmlFor="instance-setup-code">
        {t("setup.code")}
        <Input.Password
          autoComplete="one-time-code"
          id="instance-setup-code"
          onChange={(event) => setCode(event.target.value)}
          size="large"
          value={code}
        />
      </label>
      <Button
        disabled={!code.trim()}
        htmlType="submit"
        loading={pending}
        size="large"
        type="primary"
      >
        {t("setup.continue")}
      </Button>
    </form>
  );
}
