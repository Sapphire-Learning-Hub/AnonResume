"use client";

import { Button, Input } from "antd";
import { useState } from "react";

import { createAdminTranslator } from "@/i18n/admin-messages";
import { useI18n } from "@/i18n/I18nProvider";

import { useAdminSetupStyles } from "./styles";

export interface AdminSetupAccountValue {
  name: string;
  email: string;
  password: string;
  deviceName: string;
}

export function AdminSetupAccount({
  pending,
  onSubmit,
  onPasswordMismatch,
}: {
  pending: boolean;
  onSubmit: (value: AdminSetupAccountValue) => Promise<void>;
  onPasswordMismatch: () => void;
}) {
  const { styles } = useAdminSetupStyles();
  const { locale } = useI18n();
  const t = createAdminTranslator(locale);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [deviceName, setDeviceName] = useState(() =>
    t("security.defaultDeviceName"),
  );

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (password !== confirmation) {
          onPasswordMismatch();
          return;
        }
        void onSubmit({ name, email, password, deviceName });
      }}
    >
      <label className={styles.field} htmlFor="setup-name">
        {t("setup.name")}
        <Input
          autoComplete="name"
          id="setup-name"
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          required
          size="large"
          value={name}
        />
      </label>
      <label className={styles.field} htmlFor="setup-email">
        {t("setup.email")}
        <Input
          autoComplete="email"
          id="setup-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          size="large"
          type="email"
          value={email}
        />
      </label>
      <label className={styles.field} htmlFor="setup-password">
        {t("setup.password")}
        <Input.Password
          autoComplete="new-password"
          id="setup-password"
          maxLength={128}
          minLength={12}
          onChange={(event) => setPassword(event.target.value)}
          required
          size="large"
          value={password}
        />
      </label>
      <label className={styles.field} htmlFor="setup-password-confirmation">
        {t("setup.confirmPassword")}
        <Input.Password
          autoComplete="new-password"
          id="setup-password-confirmation"
          maxLength={128}
          minLength={12}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          size="large"
          value={confirmation}
        />
      </label>
      <label className={styles.field} htmlFor="setup-device-name">
        {t("setup.deviceName")}
        <Input
          id="setup-device-name"
          maxLength={60}
          onChange={(event) => setDeviceName(event.target.value)}
          required
          size="large"
          value={deviceName}
        />
      </label>
      <Button htmlType="submit" loading={pending} size="large" type="primary">
        {t("setup.configureMfa")}
      </Button>
    </form>
  );
}
