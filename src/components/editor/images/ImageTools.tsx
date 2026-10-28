"use client";

import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  LinkOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import { Button, Select, Tooltip } from "antd";
import { useState } from "react";
import { EditorRibbonPropertyGroup } from "@/components/editor/EditorRibbon";
import { useResumeEditorShellStyles } from "@/components/editor/ResumeEditorShell.style";
import { DraftInput } from "@/components/editor/inspector/DraftInput";
import type { ImageBlock } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";
import { ImageCropDialog } from "./ImageCropDialog";
import { useImageToolsStyles } from "./ImageTools.style";

function parseDimension(value: string) {
  const number = Number(value);
  return value.trim() &&
    Number.isFinite(number) &&
    number >= 1 &&
    number <= 4096
    ? number
    : undefined;
}
function displayNumber(value: number) {
  return String(Number(value.toFixed(2)));
}

export function ImageTools({
  block,
  onChange,
  onReplace,
  onDelete,
}: {
  block: ImageBlock;
  onChange: (value: ImageBlock) => void;
  onReplace: () => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useImageToolsStyles();
  const { styles: ribbonStyles } = useResumeEditorShellStyles();
  const [locked, setLocked] = useState(true);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropDraft, setCropDraft] = useState(block);
  function update(patch: Partial<ImageBlock>) {
    onChange({ ...block, ...patch });
  }
  function dimension(key: "width" | "height", value: number) {
    if (!locked) {
      update({ [key]: value });
      return;
    }
    const ratio = block.width / block.height;
    const width = key === "width" ? value : value * ratio;
    const height = width / ratio;
    const scale = Math.min(1, 4096 / width, 4096 / height);
    update({ width: width * scale, height: height * scale });
  }
  return (
    <>
      <EditorRibbonPropertyGroup label={t("images.sizeGroup")}>
        <div className={styles.stack}>
          {(["width", "height"] as const).map((key) => (
            <label key={key} className={styles.row}>
              <span className={styles.label}>{t(`images.${key}`)}</span>
              <DraftInput
                className={styles.number}
                size="small"
                type="number"
                min={1}
                max={4096}
                step="any"
                aria-label={t(`images.${key}`)}
                value={displayNumber(block[key])}
                parseValue={parseDimension}
                onValidValueChange={(value) => dimension(key, value)}
              />
            </label>
          ))}
        </div>
        <Tooltip title={t("images.ratio")}>
          <Button
            size="small"
            aria-label={t("images.ratio")}
            aria-pressed={locked}
            type={locked ? "primary" : "default"}
            icon={locked ? <LinkOutlined /> : <UnlockOutlined />}
            onClick={() => setLocked((value) => !value)}
          />
        </Tooltip>
      </EditorRibbonPropertyGroup>
      <EditorRibbonPropertyGroup label={t("images.appearanceGroup")}>
        <div className={styles.stack}>
          <div className={styles.row}>
            <span className={styles.label}>{t("images.fit")}</span>
            <Select
              className={styles.select}
              size="small"
              aria-label={t("images.fit")}
              value={block.fit}
              options={[
                { value: "cover", label: t("images.cover") },
                { value: "contain", label: t("images.contain") },
              ]}
              onChange={(fit) => update({ fit })}
            />
            <label className={styles.row}>
              <span className={styles.label}>{t("images.radius")}</span>
              <DraftInput
                className={styles.number}
                size="small"
                type="number"
                min={0}
                max={2048}
                aria-label={t("images.radius")}
                value={displayNumber(block.radius)}
                parseValue={(value) =>
                  value.trim() &&
                  Number.isFinite(Number(value)) &&
                  Number(value) >= 0 &&
                  Number(value) <= 2048
                    ? Number(value)
                    : undefined
                }
                onValidValueChange={(radius) => update({ radius })}
              />
            </label>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>{t("images.align")}</span>
            <div
              className={ribbonStyles.ribbonCommandRow}
              role="group"
              aria-label={t("images.align")}
            >
              {(
                [
                  ["left", AlignLeftOutlined, "editor.alignLeft"],
                  ["center", AlignCenterOutlined, "editor.alignCenter"],
                  ["right", AlignRightOutlined, "editor.alignRight"],
                ] as const
              ).map(([align, Icon, label]) => (
                <Tooltip key={align} title={t(label)}>
                  <Button
                    aria-label={t(label)}
                    aria-pressed={block.align === align}
                    className={ribbonStyles.ribbonFormatButton}
                    icon={<Icon />}
                    onClick={() => update({ align })}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
      </EditorRibbonPropertyGroup>
      <EditorRibbonPropertyGroup label={t("images.descriptionGroup")}>
        <label className={styles.stack}>
          <span className={styles.label}>{t("images.alt")}</span>
          <DraftInput
            className={styles.description}
            size="small"
            aria-label={t("images.alt")}
            maxLength={500}
            value={block.alt}
            parseValue={(value) => (value.length <= 500 ? value : undefined)}
            onValidValueChange={(alt) => update({ alt })}
          />
        </label>
      </EditorRibbonPropertyGroup>
      <EditorRibbonPropertyGroup label={t("images.actionsGroup")}>
        <div className={styles.stack}>
          <div className={styles.row}>
            <Button
              size="small"
              onClick={() => {
                setCropDraft(block);
                setCropOpen(true);
              }}
            >
              {t("images.crop")}
            </Button>
            <Button size="small" onClick={onReplace}>
              {t("images.replace")}
            </Button>
          </div>
          {onDelete ? (
            <Button size="small" danger onClick={onDelete}>
              {t("editor.deleteBlock")}
            </Button>
          ) : null}
        </div>
      </EditorRibbonPropertyGroup>
      <ImageCropDialog
        open={cropOpen}
        source={block}
        draft={cropDraft}
        onDraftChange={setCropDraft}
        onCancel={() => setCropOpen(false)}
        onConfirm={() => {
          update({
            width: cropDraft.width,
            height: cropDraft.height,
            positionX: cropDraft.positionX,
            positionY: cropDraft.positionY,
            fit: "cover",
          });
          setCropOpen(false);
        }}
      />
    </>
  );
}
