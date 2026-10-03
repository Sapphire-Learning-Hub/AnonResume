"use client";

import {
  AppstoreAddOutlined,
  EyeOutlined,
  PlusOutlined,
} from "@ant-design/icons";
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

export function SectionPresetCommands({
  className,
  locale,
  onInsert,
  presets,
  settings,
}: {
  className?: string;
  locale: AppLocale;
  onInsert: (presetId: SectionPresetId) => void;
  presets: SectionPresetDefinition[];
  settings: ResumeDocument["settings"];
}) {
  const { styles } = useSectionPresetCommandsStyles();
  const { t } = useI18n();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [previewPresetId, setPreviewPresetId] = useState<SectionPresetId>();
  const previewPreset = presets.find((preset) => preset.id === previewPresetId);
  const previewSection = useMemo(() => {
    if (!previewPresetId) return undefined;

    return createSectionFromPreset(previewPresetId, locale);
  }, [locale, previewPresetId]);

  const insertPreviewedPreset = () => {
    if (!previewPresetId) return;

    const presetId = previewPresetId;

    setChooserOpen(false);
    setPreviewPresetId(undefined);
    onInsert(presetId);
  };

  const previewPresetById = (presetId: SectionPresetId) => {
    setPreviewPresetId(presetId);
  };

  const insertPresetById = (presetId: SectionPresetId) => {
    setChooserOpen(false);
    onInsert(presetId);
  };

  const closeChooser = () => {
    setChooserOpen(false);
    setPreviewPresetId(undefined);
  };

  return (
    <>
      <Button
        aria-label={t("editor.sectionPreset.chooseTemplate")}
        className={className}
        data-ribbon-control="large"
        icon={<AppstoreAddOutlined />}
        onClick={() => setChooserOpen(true)}
      >
        {t("editor.sectionPreset.chooseTemplate")}
      </Button>

      <Modal
        centered
        destroyOnHidden
        footer={null}
        open={chooserOpen && !previewPresetId}
        title={t("editor.sectionPreset.chooserTitle")}
        width={720}
        onCancel={closeChooser}
      >
        <div className={styles.chooser}>
          <div className={styles.chooserGrid}>
            {presets.map((preset) => (
              <div className={styles.templateCard} key={preset.id}>
                <div className={styles.templateSummary}>
                  <span className={styles.templateName}>{preset.label}</span>
                  <span className={styles.templateDescription}>
                    {preset.description}
                  </span>
                </div>
                <div className={styles.templateActions} data-template-actions>
                  <Button
                    aria-label={t("editor.sectionPreset.previewNamed", {
                      label: preset.label,
                    })}
                    className={styles.templateAction}
                    icon={<EyeOutlined />}
                    type="text"
                    onClick={() => previewPresetById(preset.id)}
                  >
                    {t("editor.sectionPreset.preview")}
                  </Button>
                  <Button
                    aria-label={t("editor.sectionPreset.insertNamed", {
                      label: preset.label,
                    })}
                    className={styles.templateAction}
                    data-action-primary
                    icon={<PlusOutlined />}
                    type="text"
                    onClick={() => insertPresetById(preset.id)}
                  >
                    {t("editor.sectionPreset.insert")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        centered
        cancelText={t("common.cancel")}
        forceRender
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
              <div className={styles.previewScale}>
                <ResumeSectionRenderer
                  key={previewPresetId}
                  mode="view"
                  settings={settings}
                  sections={[previewSection]}
                />
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
