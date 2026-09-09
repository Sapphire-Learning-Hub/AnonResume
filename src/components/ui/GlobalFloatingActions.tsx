"use client";

import { createStyles } from "antd-style";

import { PdfExportTaskOverlay } from "@/components/pdf/PdfExportTaskOverlay";
import { useI18n } from "@/i18n/I18nProvider";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";

const useStyles = createStyles(({ css, token }) => ({
  rail: css`
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: ${token.zIndexPopupBase + 20};
    display: flex;
    width: 40px;
    flex-direction: column;
    gap: 12px;

    [data-floating-action-item] {
      position: relative;
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
    }

    && .ant-float-btn {
      position: static;
      inset: auto;
      width: 40px;
      height: 40px;
    }

    @media (max-width: 640px) {
      right: 16px;
      bottom: 16px;
    }
  `,
}));

export function GlobalFloatingActions() {
  const { styles } = useStyles();
  const { t } = useI18n();

  return (
    <div
      aria-label={t("common.floatingActions")}
      className={styles.rail}
      data-floating-action-rail="true"
      data-print-chrome="screen"
      role="group"
    >
      <PdfExportTaskOverlay />
      <LocaleSwitcher />
    </div>
  );
}
