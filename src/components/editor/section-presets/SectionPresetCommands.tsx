"use client";

import { EyeOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Modal } from "antd";
import { useMemo, useState } from "react";

import { ResumeSectionRenderer } from "@/components/resume/ResumeRenderer";
import {
  createSectionFromPreset,
  type SectionPresetDefinition,
  type SectionPresetId,
} from "@/domain/resume/presets";
import type { ResumeDocument } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";
import type { AppLocale } from "@/i18n/messages";

import { useSectionPresetCommandsStyles } from "./SectionPresetCommands.style";

const A4_WIDTH_PX = (210 / 25.4) * 96;
const PREVIEW_SCALE = 0.62;

export function SectionPresetCommands({
  locale,
  onInsert,
  presets,
  settings,
}: {
  locale: AppLocale;
  onInsert: (presetId: SectionPresetId) => void;
  presets: SectionPresetDefinition[];
  settings: ResumeDocument["settings"];
}) {
  const { styles } = useSectionPresetCommandsStyles();
  const { t } = useI18n();
  const [previewPresetId, setPreviewPresetId] = useState<SectionPresetId>();
  const previewPreset = presets.find((preset) => preset.id === previewPresetId);
  const previewSection = useMemo(() => {
    if (!previewPresetId) return undefined;

    return createSectionFromPreset(previewPresetId, locale);
  }, [locale, previewPresetId]);

  const insertPreviewedPreset = () => {
    if (!previewPresetId) return;

    const presetId = previewPresetId;

    setPreviewPresetId(undefined);
    onInsert(presetId);
  };

  return (
    <>
      <div className={styles.grid}>
        {presets.map((preset) => (
          <div className={styles.card} key={preset.id}>
            <span className={styles.label}>{preset.label}</span>
            <div className={styles.actions} data-section-preset-actions>
              <Button
                aria-label={t("editor.sectionPreset.previewNamed", {
                  label: preset.label,
                })}
                className={styles.actionButton}
                icon={<EyeOutlined />}
                onClick={() => setPreviewPresetId(preset.id)}
              >
                {t("editor.sectionPreset.preview")}
              </Button>
              <Button
                aria-label={t("editor.sectionPreset.insertNamed", {
                  label: preset.label,
                })}
                className={styles.actionButton}
                icon={<PlusOutlined />}
                onClick={() => onInsert(preset.id)}
              >
                {t("editor.sectionPreset.insert")}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        centered
        cancelText={t("common.cancel")}
        destroyOnHidden
        okText={t("editor.sectionPreset.useTemplate")}
        open={Boolean(previewPreset && previewSection)}
        title={
          previewPreset
            ? t("editor.sectionPreset.previewTitle", {
                label: previewPreset.label,
              })
            : undefined
        }
        width={720}
        onCancel={() => setPreviewPresetId(undefined)}
        onOk={insertPreviewedPreset}
      >
        {previewPreset && previewSection ? (
          <>
            <p className={styles.previewIntro}>{previewPreset.description}</p>
            <div className={styles.previewViewport}>
              <div
                className={styles.previewPage}
                style={{
                  width: A4_WIDTH_PX * PREVIEW_SCALE,
                  height: (297 / 25.4) * 96 * PREVIEW_SCALE,
                }}
              >
                <div
                  style={{
                    width: A4_WIDTH_PX,
                    transform: `scale(${PREVIEW_SCALE})`,
                    transformOrigin: "top left",
                  }}
                >
                  <ResumeSectionRenderer
                    key={previewPresetId}
                    mode="view"
                    settings={settings}
                    sections={[previewSection]}
                    zoom={PREVIEW_SCALE}
                  />
                </div>
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
