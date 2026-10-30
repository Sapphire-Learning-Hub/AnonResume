"use client";
import { InlineMetadata } from "@/components/ui/InlineMetadata";

import { Button } from "antd";
import { createStyles } from "antd-style";

import type { ResumeFontPreset } from "@/domain/resume/font-presets";
import { useI18n } from "@/i18n/I18nProvider";

const useStyles = createStyles(({ token, css }) => ({
  tray: css`
    position: fixed;
    z-index: ${token.zIndexPopupBase};
    display: flex;
    right: 28px;
    bottom: 24px;
    left: max(28px, var(--app-sidebar-width, 0px));
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgElevated};
    box-shadow: ${token.boxShadowSecondary};
  `,
  names: css`
    overflow: hidden;
    color: ${token.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  actions: css`
    display: flex;
    flex: none;
    gap: 8px;
  `,
}));

export function FontCompareTray({
  presets,
  onClear,
  onCompare,
}: {
  presets: ResumeFontPreset[];
  onClear: () => void;
  onCompare: () => void;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  if (presets.length === 0) return null;

  return (
    <aside aria-label={t("fontMarket.compareSelection")} className={styles.tray}>
      <span className={styles.names}><InlineMetadata>{presets.map((preset) => <span key={preset.id}>{preset.name}</span>)}</InlineMetadata></span>
      <div className={styles.actions}>
        <Button onClick={onClear}>{t("fontMarket.compareClear")}</Button>
        <Button disabled={presets.length < 2} onClick={onCompare} type="primary">
          {t("fontMarket.compareAction", { count: presets.length })}
        </Button>
      </div>
    </aside>
  );
}
