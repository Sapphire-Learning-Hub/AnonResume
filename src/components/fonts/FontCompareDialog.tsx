"use client";

import { Button } from "antd";

import type { ResumeFontPreset } from "@/domain/resume/font-presets";
import { useI18n } from "@/i18n/I18nProvider";

import { FontSpecimen } from "./FontSpecimen";
import { FontDialogFrame } from "./FontDialogFrame";

export function FontCompareDialog({
  open,
  presets,
  previewText,
  onClose,
  onRemove,
}: {
  open: boolean;
  presets: ResumeFontPreset[];
  previewText: string;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();

  return (
    <FontDialogFrame
      onClose={onClose}
      open={open}
      title={t("fontMarket.compareTitle")}
      width="90vw"
    >
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: `repeat(${Math.max(1, presets.length)}, minmax(0, 1fr))`,
          overflowX: "auto",
        }}
      >
        {presets.map((preset) => (
          <section key={preset.id} style={{ minWidth: 220 }}>
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3>{preset.name}</h3>
              <Button onClick={() => onRemove(preset.id)} type="text">
                {t("fontMarket.compareRemove")}
              </Button>
            </header>
            <FontSpecimen preset={preset} previewText={previewText} />
          </section>
        ))}
      </div>
    </FontDialogFrame>
  );
}
