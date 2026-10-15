"use client";

import { Button, Segmented, Select } from "antd";
import { createStyles } from "antd-style";

import type {
  FontMarketFilters as FontMarketFilterState,
  FontMarketSort,
} from "@/domain/resume/fonts/market";
import type {
  ResumeFontCategory,
  ResumeFontScript,
  ResumeFontUseCase,
} from "@/domain/resume/font-presets";
import { useI18n } from "@/i18n/I18nProvider";

const useStyles = createStyles(({ token, css }) => ({
  root: css`
    position: sticky;
    z-index: 2;
    top: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    overflow-x: auto;
    padding: 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: color-mix(in srgb, ${token.colorBgContainer} 94%, transparent);
    box-shadow: 0 8px 28px color-mix(in srgb, ${token.colorText} 7%, transparent);
    backdrop-filter: blur(12px);

    & > * {
      flex: 0 0 auto;
    }
  `,
  multiSelect: css`
    && {
      min-width: 150px;
      max-width: 220px;
    }
  `,
  sortSelect: css`
    && {
      min-width: 128px;
    }
  `,
}));

export function FontMarketFilters({
  filters,
  onChange,
  onClear,
}: {
  filters: FontMarketFilterState;
  onChange: (filters: FontMarketFilterState) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const category = filters.categories.length === 1 ? filters.categories[0] : "all";

  return (
    <div className={styles.root} data-testid="font-market-filters">
      <Segmented<ResumeFontCategory | "all">
        aria-label={t("fontMarket.categoryFilter")}
        onChange={(value) =>
          onChange({ ...filters, categories: value === "all" ? [] : [value] })
        }
        options={[
          { label: t("fontMarket.category.all"), value: "all" },
          { label: t("fontMarket.category.sans"), value: "sans" },
          { label: t("fontMarket.category.serif"), value: "serif" },
          { label: t("fontMarket.category.mono"), value: "mono" },
          { label: t("fontMarket.category.handwriting"), value: "handwriting" },
        ]}
        value={category}
      />
      <Select<ResumeFontScript[]>
        aria-label={t("fontMarket.scriptFilter")}
        className={styles.multiSelect}
        mode="multiple"
        onChange={(scripts) => onChange({ ...filters, scripts })}
        options={[
          { label: t("fontMarket.script.latin"), value: "latin" },
          { label: t("fontMarket.script.zh-CN"), value: "zh-CN" },
        ]}
        placeholder={t("fontMarket.scriptFilter")}
        value={filters.scripts}
      />
      <Select<ResumeFontUseCase[]>
        aria-label={t("fontMarket.useCaseFilter")}
        className={styles.multiSelect}
        mode="multiple"
        onChange={(useCases) => onChange({ ...filters, useCases })}
        options={([
          "business",
          "compact",
          "body",
          "editorial",
          "display",
          "technical",
          "creative",
        ] as const).map((value) => ({
          label: t(`fontMarket.useCase.${value}`),
          value,
        }))}
        placeholder={t("fontMarket.useCaseFilter")}
        value={filters.useCases}
      />
      <Select<FontMarketSort>
        aria-label={t("fontMarket.sort")}
        className={styles.sortSelect}
        onChange={(sort) => onChange({ ...filters, sort })}
        options={([
          "recent",
          "newest",
          "name",
        ] as const).map((value) => ({
          label: t(`fontMarket.sort.${value}`),
          value,
        }))}
        value={filters.sort}
      />
      <Button onClick={onClear}>{t("fontMarket.clearFilters")}</Button>
    </div>
  );
}
