"use client";

import { Form, Modal, Select, Slider } from "antd";
import { createStyles } from "antd-style";
import { useRef, type Dispatch, type SetStateAction } from "react";
import { ResumeImage } from "@/components/resume/images/ResumeImage";
import type { ImageBlock } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";

const useStyles = createStyles(({ css, token }) => ({
  preview: css`
    display: grid;
    place-items: center;
    min-height: 320px;
    padding: 16px;
    overflow: hidden;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorFillQuaternary};
  `,
  frame: css`
    touch-action: none;
    cursor: grab;
    &:active {
      cursor: grabbing;
    }
    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: 3px;
    }
  `,
  controls: css`
    display: grid;
    gap: 0 24px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  `,
}));

export function ImageCropDialog({
  open,
  source,
  draft,
  onDraftChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  source: ImageBlock;
  draft: ImageBlock;
  onDraftChange: Dispatch<SetStateAction<ImageBlock>>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const gesture = useRef<{
    x: number;
    y: number;
    positionX: number;
    positionY: number;
  } | null>(null);
  const previewScale = Math.min(520 / draft.width, 300 / draft.height);
  const width = draft.width * previewScale;
  const height = draft.height * previewScale;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const ratio = draft.width / draft.height;
  return (
    <Modal
      open={open}
      width={640}
      title={t("images.crop")}
      okText={t("images.save")}
      cancelText={t("images.cancel")}
      onCancel={onCancel}
      onOk={onConfirm}
    >
      <div className={styles.preview}>
        <div
          className={styles.frame}
          style={{ width, height }}
          role="group"
          tabIndex={0}
          aria-label={t("images.cropPreview")}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            gesture.current = {
              x: event.clientX,
              y: event.clientY,
              positionX: draft.positionX,
              positionY: draft.positionY,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = gesture.current;
            if (
              !start ||
              !event.currentTarget.hasPointerCapture(event.pointerId)
            )
              return;
            const frame = event.currentTarget.getBoundingClientRect();
            const scale = Math.max(
              frame.width / draft.intrinsicWidth,
              frame.height / draft.intrinsicHeight,
            );
            const overflowX = draft.intrinsicWidth * scale - frame.width;
            const overflowY = draft.intrinsicHeight * scale - frame.height;
            onDraftChange((previous) => ({
              ...previous,
              positionX:
                overflowX > 0
                  ? clamp(
                      start.positionX -
                        ((event.clientX - start.x) * 100) / overflowX,
                    )
                  : start.positionX,
              positionY:
                overflowY > 0
                  ? clamp(
                      start.positionY -
                        ((event.clientY - start.y) * 100) / overflowY,
                    )
                  : start.positionY,
            }));
          }}
          onLostPointerCapture={() => {
            gesture.current = null;
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            gesture.current = null;
          }}
          onKeyDown={(event) => {
            if (
              event.target !== event.currentTarget ||
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key,
              )
            )
              return;
            event.preventDefault();
            onDraftChange((previous) => ({
              ...previous,
              positionX: clamp(
                previous.positionX +
                  (event.key === "ArrowLeft"
                    ? -1
                    : event.key === "ArrowRight"
                      ? 1
                      : 0),
              ),
              positionY: clamp(
                previous.positionY +
                  (event.key === "ArrowUp"
                    ? -1
                    : event.key === "ArrowDown"
                      ? 1
                      : 0),
              ),
            }));
          }}
        >
          <ResumeImage
            block={{
              ...draft,
              width,
              height,
              align: "center",
              fit: "cover",
              radius: draft.radius * previewScale,
            }}
          />
        </div>
      </div>
      <p>{t("images.cropHint")}</p>
      <Form layout="vertical">
        <Form.Item label={t("images.cropRatio")}>
          <Select
            aria-label={t("images.cropRatio")}
            value={
              Math.abs(ratio - 1) < 0.001
                ? "square"
                : Math.abs(ratio - 0.75) < 0.001
                  ? "portrait"
                  : "current"
            }
            options={[
              { value: "current", label: t("images.currentRatio") },
              { value: "square", label: t("images.square") },
              { value: "portrait", label: t("images.portrait") },
            ]}
            onChange={(value) => {
              const nextRatio =
                value === "square"
                  ? 1
                  : value === "portrait"
                    ? 0.75
                    : source.width / source.height;
              onDraftChange((previous) => {
                const width = Math.min(previous.width, 4096 * nextRatio);
                return { ...previous, width, height: width / nextRatio };
              });
            }}
          />
        </Form.Item>
        <div className={styles.controls}>
          <Form.Item label={t("images.positionX")}>
            <Slider
              ariaLabelForHandle={t("images.positionX")}
              min={0}
              max={100}
              value={draft.positionX}
              onChange={(positionX) =>
                onDraftChange((previous) => ({ ...previous, positionX }))
              }
            />
          </Form.Item>
          <Form.Item label={t("images.positionY")}>
            <Slider
              ariaLabelForHandle={t("images.positionY")}
              min={0}
              max={100}
              value={draft.positionY}
              onChange={(positionY) =>
                onDraftChange((previous) => ({ ...previous, positionY }))
              }
            />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
