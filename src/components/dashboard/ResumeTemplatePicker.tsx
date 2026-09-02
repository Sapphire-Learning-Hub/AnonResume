"use client";

import { CheckOutlined } from "@ant-design/icons";
import { Button, Modal } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";

import {
  listResumeTemplates,
  type ResumeTemplateId,
} from "@/domain/resume/templates";
import { useEditorViewportAccess } from "@/components/editor/EditorViewportGuard";
import { useI18n } from "@/i18n/I18nProvider";

import { ResumeRenderer } from "../resume/ResumeRenderer";

const PREVIEW_SCALE = 0.235;

const useStyles = createStyles(({ token, css }) => ({
  modalBody: css`
    max-height: min(680px, calc(100vh - 190px));
    padding-block: 18px 8px;
    overflow-y: auto;
  `,
  templateGrid: css`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;

    @media (max-width: 960px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 560px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  templateCard: css`
    position: relative;
    display: grid;
    min-width: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;

    &:hover {
      border-color: ${token.colorPrimaryBorder};
    }

    &:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 2px ${token.colorPrimaryBorder};
    }

    &[aria-checked="true"] {
      border-color: ${token.colorPrimary};
      background: ${token.colorPrimaryBg};
      box-shadow: inset 0 0 0 1px ${token.colorPrimary};
    }

    &[aria-checked="true"]:focus-visible {
      box-shadow: inset 0 0 0 2px ${token.colorPrimary};
    }
  `,
  previewViewport: css`
    position: relative;
    height: 294px;
    overflow: hidden;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorFillQuaternary};
    pointer-events: none;

    [data-print-chrome="screen"] {
      display: none;
    }
  `,
  previewDocument: css`
    position: absolute;
    top: 12px;
    left: 50%;
    width: 210mm;
    margin-left: -105mm;
    transform: scale(${PREVIEW_SCALE});
    transform-origin: top center;

    [data-resume-page="true"] {
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.12);
    }
  `,
  cardMeta: css`
    display: grid;
    min-height: 84px;
    padding: 14px 15px 16px;
    gap: 5px;
  `,
  cardTitleRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  `,
  cardTitle: css`
    color: ${token.colorText};
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
  `,
  selectedMark: css`
    display: grid;
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    place-items: center;
    border: 1px solid ${token.colorBorder};
    border-radius: 50%;
    color: transparent;
    font-size: 12px;

    &[data-selected="true"] {
      border-color: ${token.colorPrimary};
      background: ${token.colorPrimary};
      color: ${token.colorTextLightSolid};
    }
  `,
  cardDescription: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1.5;
  `,
}));

export function ResumeTemplatePicker({
  createAction,
  onClose,
  open,
}: {
  createAction: string;
  onClose: () => void;
  open: boolean;
}) {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const editorAccess = useEditorViewportAccess();
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<ResumeTemplateId>("blank");
  const templates = listResumeTemplates(locale);

  return (
    <Modal
      afterOpenChange={(visible) => {
        if (!visible) {
          setSelectedTemplateId("blank");
        }
      }}
      centered
      classNames={{ body: styles.modalBody }}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t("dashboard.templatePicker.cancel")}
        </Button>,
        <Button
          form="create-resume-template-form"
          htmlType="submit"
          key="confirm"
          type="primary"
        >
          {t("dashboard.templatePicker.confirm")}
        </Button>,
      ]}
      onCancel={onClose}
      open={open}
      title={t("dashboard.templatePicker.title")}
      width={1160}
    >
      <form
        action={createAction}
        data-testid="create-resume-template-form"
        id="create-resume-template-form"
        method="post"
      >
        <input name="templateId" type="hidden" value={selectedTemplateId} />
        <input
          name="returnTo"
          type="hidden"
          value={editorAccess === "allowed" ? "editor" : "/app"}
        />
        <div
          aria-label={t("dashboard.templatePicker.title")}
          className={styles.templateGrid}
          role="radiogroup"
        >
          {templates.map((template) => {
            const selected = template.id === selectedTemplateId;

            return (
              <button
                aria-checked={selected}
                className={styles.templateCard}
                data-selected={selected}
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                onKeyDown={(event) => {
                  if (event.key === " ") {
                    event.preventDefault();
                    setSelectedTemplateId(template.id);
                  }
                }}
                role="radio"
                type="button"
              >
                <span aria-hidden="true" className={styles.previewViewport}>
                  <span className={styles.previewDocument}>
                    <ResumeRenderer
                      document={template.document}
                      mode="view"
                      zoom={PREVIEW_SCALE}
                    />
                  </span>
                </span>
                <span className={styles.cardMeta}>
                  <span className={styles.cardTitleRow}>
                    <span className={styles.cardTitle}>
                      {t(template.nameKey)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={styles.selectedMark}
                      data-selected={selected}
                      data-selection-mark="true"
                    >
                      <CheckOutlined />
                    </span>
                  </span>
                  <span className={styles.cardDescription}>
                    {t(template.descriptionKey)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </form>
    </Modal>
  );
}
