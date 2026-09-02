"use client";

import { FileMarkdownOutlined } from "@ant-design/icons";
import { Modal } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";

import { useEditorViewportAccess } from "@/components/editor/EditorViewportGuard";
import { useI18n } from "@/i18n/I18nProvider";

import { ResumeMarkdownImportDialog } from "./ResumeMarkdownImportDialog";

const useStyles = createStyles(({ token, css }) => ({
  formatGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding-block: 8px;
    gap: 12px;

    @media (max-width: 560px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  formatCard: css`
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: center;
    min-height: 82px;
    padding: 16px;
    gap: 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      background 120ms ease,
      box-shadow 120ms ease;

    &:hover {
      border-color: ${token.colorPrimaryBorder};
      background: ${token.colorPrimaryBg};
    }

    &:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 2px ${token.colorPrimaryBorder};
    }
  `,
  formatIcon: css`
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimary};
    font-size: 22px;
  `,
  formatMeta: css`
    display: grid;
    min-width: 0;
    gap: 3px;
  `,
  formatName: css`
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
  `,
  formatExtensions: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1.4;
  `,
}));

export function ResumeImportPicker({
  createAction,
  onClose,
  open,
}: {
  createAction: string;
  onClose: () => void;
  open: boolean;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const editorAccess = useEditorViewportAccess();
  const [activeFormat, setActiveFormat] = useState<"markdown">();

  if (activeFormat === "markdown") {
    return (
      <ResumeMarkdownImportDialog
        afterOpenChange={(visible) => {
          if (!visible) {
            setActiveFormat(undefined);
          }
        }}
        createAction={createAction}
        onClose={onClose}
        open={open}
        returnTo={editorAccess === "allowed" ? "editor" : "/app"}
      />
    );
  }

  return (
    <Modal
      afterOpenChange={(visible) => {
        if (!visible) {
          setActiveFormat(undefined);
        }
      }}
      centered
      footer={null}
      onCancel={onClose}
      open={open}
      title={t("dashboard.importPicker.title")}
      width={640}
    >
      <div className={styles.formatGrid}>
        <button
          className={styles.formatCard}
          onClick={() => setActiveFormat("markdown")}
          type="button"
        >
          <span aria-hidden="true" className={styles.formatIcon}>
            <FileMarkdownOutlined />
          </span>
          <span className={styles.formatMeta}>
            <span className={styles.formatName}>
              {t("dashboard.importPicker.markdown")}
            </span>
            <span className={styles.formatExtensions}>
              {t("dashboard.importPicker.markdownExtensions")}
            </span>
          </span>
        </button>
      </div>
    </Modal>
  );
}
