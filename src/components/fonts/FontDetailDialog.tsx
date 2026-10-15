"use client";

import { Button, Tag } from "antd";

import type { ResumeFontPreset } from "@/domain/resume/font-presets";
import { useI18n } from "@/i18n/I18nProvider";

import { FontSpecimen } from "./FontSpecimen";
import { FontDialogFrame } from "./FontDialogFrame";

export function FontDetailDialog({
  open,
  preset,
  previewText,
  onApply,
  onClose,
}: {
  open: boolean;
  preset?: ResumeFontPreset;
  previewText: string;
  onApply: (preset: ResumeFontPreset) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <FontDialogFrame
      onClose={onClose}
      open={open && Boolean(preset)}
      title={preset?.name ?? ""}
    >
      {preset ? (
        <div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
            }}
          >
            <Tag>{t(`fontMarket.category.${preset.category}`)}</Tag>
            {preset.scripts.map((script) => (
              <Tag key={script}>{t(`fontMarket.script.${script}`)}</Tag>
            ))}
            {preset.useCases.map((useCase) => (
              <Tag key={useCase}>{t(`fontMarket.useCase.${useCase}`)}</Tag>
            ))}
          </div>
          <FontSpecimen preset={preset} previewText={previewText} />
          <p>
            <a href={preset.source} rel="noreferrer" target="_blank">
              {t("fontMarket.source")}
            </a>
            {" · "}
            {t("fontMarket.license")}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={() => onApply(preset)} type="primary">
              {t("fontMarket.apply")}
            </Button>
          </div>
        </div>
      ) : null}
    </FontDialogFrame>
  );
}
