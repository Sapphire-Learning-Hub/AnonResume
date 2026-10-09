"use client";

import { Checkbox } from "antd";
import { createStyles } from "antd-style";

import { usePublicRuntimeConfig } from "@/components/config/usePublicRuntimeConfig";
import { useI18n } from "@/i18n/I18nProvider";
import { resolvePublicInformationDestinations } from "@/lib/public-info/destinations";

const useStyles = createStyles(({ token, css }) => ({
  consent: css`
    && {
      align-items: flex-start;
      color: ${token.colorTextSecondary};
      font-size: 13px;
      line-height: 1.6;
    }

    && > .ant-checkbox {
      margin-top: 3px;
    }
  `,
  link: css`
    color: ${token.colorPrimary};
    text-decoration: none;

    &:hover {
      color: ${token.colorPrimaryHover};
      text-decoration: underline;
    }
  `,
}));

export function RegistrationConsent({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const destinations = resolvePublicInformationDestinations(
    usePublicRuntimeConfig(),
  );

  return (
    <Checkbox
      className={styles.consent}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    >
      {t("auth.registrationConsentPrefix")}
      <a
        className={styles.link}
        href={destinations.privacy.href}
        onClick={(event) => event.stopPropagation()}
        rel="noreferrer"
        target="_blank"
      >
        {t("legal.privacy.title")}
      </a>
      {t("auth.registrationConsentJoin")}
      <a
        className={styles.link}
        href={destinations.terms.href}
        onClick={(event) => event.stopPropagation()}
        rel="noreferrer"
        target="_blank"
      >
        {t("legal.terms.title")}
      </a>
    </Checkbox>
  );
}
