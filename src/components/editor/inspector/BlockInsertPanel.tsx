"use client";

import {
  AlignLeftOutlined,
  ColumnWidthOutlined,
  GroupOutlined,
  TagsOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Button } from "antd";
import { createStyles } from "antd-style";
import type { ReactNode } from "react";

import {
  listBlockPresets,
  type BlockPresetId,
} from "@/domain/resume/block-presets";
import { useI18n } from "@/i18n/I18nProvider";

const presetIcons = {
  text: <AlignLeftOutlined />,
  badges: <TagsOutlined />,
  list: <UnorderedListOutlined />,
  group: <GroupOutlined />,
  row: <ColumnWidthOutlined />,
} satisfies Record<BlockPresetId, ReactNode>;

const useStyles = createStyles(({ token, css }) => ({
  panel: css`
    display: grid;
    gap: 10px;
    padding-top: 0;
    border-top: 0;
  `,
  headingRow: css`
    display: grid;
    gap: 2px;
  `,
  heading: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  `,
  context: css`
    color: ${token.colorTextSecondary};
    font-size: 11px;
    line-height: 1.45;
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  `,
  button: css`
    && {
      min-width: 0;
      height: auto;
      min-height: 58px;
      padding: 9px 10px;
      border-radius: ${token.borderRadiusSM}px;
      text-align: left;
      white-space: normal;
    }

    && > span {
      min-width: 0;
    }
  `,
  buttonContent: css`
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    width: 100%;
  `,
  buttonCopy: css`
    display: grid;
    min-width: 0;
    gap: 1px;
  `,
  buttonLabel: css`
    color: ${token.colorText};
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
  `,
  buttonDescription: css`
    color: ${token.colorTextSecondary};
    font-size: 10px;
    line-height: 1.35;
  `,
}));

export function BlockInsertPanel({
  insertAfterSelection,
  onInsert,
}: {
  insertAfterSelection: boolean;
  onInsert: (presetId: BlockPresetId) => void;
}) {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const presets = listBlockPresets(locale);

  return (
    <section className={styles.panel} data-testid="block-insert-panel">
      <div className={styles.headingRow}>
        <h3 className={styles.heading}>{t("editor.addContent")}</h3>
        <span className={styles.context}>
          {t(
            insertAfterSelection
              ? "editor.addContentAfterSelection"
              : "editor.addContentToSection",
          )}
        </span>
      </div>
      <div className={styles.grid}>
        {presets.map((preset) => (
          <Button
            aria-label={t(preset.labelKey)}
            className={styles.button}
            key={preset.id}
            onClick={() => onInsert(preset.id)}
          >
            <span className={styles.buttonContent}>
              {presetIcons[preset.id]}
              <span className={styles.buttonCopy}>
                <span className={styles.buttonLabel}>{t(preset.labelKey)}</span>
                <span className={styles.buttonDescription}>
                  {t(preset.descriptionKey)}
                </span>
              </span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
