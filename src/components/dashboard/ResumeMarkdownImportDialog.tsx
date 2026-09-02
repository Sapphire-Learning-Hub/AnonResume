"use client";

import {
  FileTextOutlined,
  InboxOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Alert, Button, Input, Modal, Segmented, Tag } from "antd";
import { createStyles } from "antd-style";
import { useRef, useState } from "react";

import { importResumeMarkdown } from "@/domain/resume/import/markdown";
import type {
  ResumeImportDiagnostic,
  ResumeMarkdownDialect,
  ResumeMarkdownImportResult,
} from "@/domain/resume/import/types";
import { useI18n } from "@/i18n/I18nProvider";

import { ResumeRenderer } from "../resume/ResumeRenderer";

const PREVIEW_SCALE = 0.52;

const useStyles = createStyles(({ token, css }) => ({
  modalBody: css`
    height: min(680px, calc(100vh - 160px));
    min-height: 520px;
    padding-block: 18px 8px;
    overflow: hidden;

    @media (max-width: 760px) {
      height: min(720px, calc(100vh - 110px));
      min-height: 0;
      overflow-y: auto;
    }
  `,
  importForm: css`
    height: 100%;
  `,
  layout: css`
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-columns: minmax(320px, 0.92fr) minmax(420px, 1.08fr);
    gap: 18px;

    @media (max-width: 760px) {
      height: auto;
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  column: css`
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
  `,
  toolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    gap: 12px;
  `,
  columnTitle: css`
    color: ${token.colorText};
    font-size: 14px;
    font-weight: 600;
  `,
  uploadInput: css`
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    clip-path: inset(50%);
  `,
  sourceEditor: css`
    && {
      flex: 1;
      min-height: 0;
      resize: none;
      font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
      font-size: 13px;
      line-height: 1.65;

      @media (max-width: 760px) {
        min-height: 280px;
      }
    }
  `,
  sourceFooter: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    gap: 12px;
  `,
  dialectGroup: css`
    display: flex;
    min-width: 0;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 10px;
  `,
  dialectHint: css`
    color: ${token.colorTextTertiary};
    font-size: 12px;
    line-height: 1.5;
    white-space: nowrap;
  `,
  previewShell: css`
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorFillQuaternary};

    @media (max-width: 760px) {
      min-height: 420px;
    }
  `,
  emptyPreview: css`
    display: grid;
    height: 100%;
    min-height: 360px;
    place-items: center;
    color: ${token.colorTextTertiary};
    text-align: center;
  `,
  emptyPreviewInner: css`
    display: grid;
    justify-items: center;
    gap: 10px;

    svg {
      color: ${token.colorTextQuaternary};
      font-size: 34px;
    }
  `,
  previewDocument: css`
    position: relative;
    width: 210mm;
    margin: 16px auto 40px;
    zoom: ${PREVIEW_SCALE};
    transform-origin: top center;
    pointer-events: none;

    [data-print-chrome="screen"] {
      display: none;
    }

    [data-resume-page="true"] {
      box-shadow: 0 10px 32px rgba(15, 23, 42, 0.14);
    }
  `,
  previewSummary: css`
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  `,
  diagnostics: css`
    display: grid;
    max-height: 108px;
    margin-top: 12px;
    overflow-y: auto;
    gap: 8px;
  `,
  diagnostic: css`
    && {
      margin: 0;
    }
  `,
}));

function hasBlockingDiagnostic(result?: ResumeMarkdownImportResult) {
  return Boolean(
    result?.report.diagnostics.some(
      (diagnostic) => diagnostic.severity === "error",
    ),
  );
}

function ResumeMarkdownImportDialogContent({
  afterOpenChange,
  createAction,
  onClose,
  open,
  returnTo,
}: {
  afterOpenChange?: (open: boolean) => void;
  createAction: string;
  onClose: () => void;
  open: boolean;
  returnTo: string;
}) {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialect, setDialect] = useState<ResumeMarkdownDialect>("auto");
  const [markdown, setMarkdown] = useState("");
  const [result, setResult] = useState<ResumeMarkdownImportResult>();

  const diagnosticMessage = (diagnostic: ResumeImportDiagnostic) => {
    switch (diagnostic.code) {
      case "source_empty":
        return t("dashboard.markdownImport.diagnostic.sourceEmpty");
      case "source_too_large":
        return t("dashboard.markdownImport.diagnostic.sourceTooLarge");
      case "dialect_auto_detected":
        return t("dashboard.markdownImport.diagnostic.autoDetected");
      case "content_before_first_heading":
        return t("dashboard.markdownImport.diagnostic.contentBeforeHeading");
      case "mujicv_unpaired_container":
        return t("dashboard.markdownImport.diagnostic.unpairedContainer");
      case "mujicv_unclosed_container":
        return t("dashboard.markdownImport.diagnostic.unclosedContainer");
      case "mujicv_unknown_icon":
        return t("dashboard.markdownImport.diagnostic.unknownIcon");
      case "raw_html_preserved_as_text":
        return t("dashboard.markdownImport.diagnostic.rawHtml");
      case "markdown_parse_failed":
        return t("dashboard.markdownImport.diagnostic.parseFailed");
      default:
        return diagnostic.message;
    }
  };

  const parseSource = () => {
    setResult(importResumeMarkdown({ dialect, locale, markdown }));
  };

  const handleOpenChange = (visible: boolean) => {
    if (!visible) {
      setDialect("auto");
      setMarkdown("");
      setResult(undefined);
    }

    afterOpenChange?.(visible);
  };

  const canCreate = Boolean(result) && !hasBlockingDiagnostic(result);

  return (
    <Modal
      afterOpenChange={handleOpenChange}
      centered
      classNames={{ body: styles.modalBody }}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t("dashboard.markdownImport.cancel")}
        </Button>,
        <Button
          disabled={!canCreate}
          form="create-markdown-resume-form"
          htmlType="submit"
          key="create"
          type="primary"
        >
          {t("dashboard.markdownImport.create")}
        </Button>,
      ]}
      onCancel={onClose}
      open={open}
      title={t("dashboard.markdownImport.title")}
      width={1160}
    >
      <form
        action={createAction}
        className={styles.importForm}
        data-testid="create-markdown-resume-form"
        id="create-markdown-resume-form"
        method="post"
      >
        <input name="creationMode" type="hidden" value="markdown" />
        <input name="dialect" type="hidden" value={dialect} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <div className={styles.layout}>
          <section className={styles.column}>
            <div className={styles.toolbar}>
              <span className={styles.columnTitle}>
                {t("dashboard.markdownImport.source")}
              </span>
              <Button
                aria-label={t("dashboard.markdownImport.upload")}
                icon={<InboxOutlined />}
                onClick={() => fileInputRef.current?.click()}
                size="small"
              >
                {t("dashboard.markdownImport.upload")}
              </Button>
              <input
                accept=".md,.markdown,text/markdown,text/plain"
                className={styles.uploadInput}
                data-testid="markdown-file-input"
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (!file) {
                    return;
                  }

                  setMarkdown(await file.text());
                  setResult(undefined);
                  input.value = "";
                }}
                ref={fileInputRef}
                type="file"
              />
            </div>
            <Input.TextArea
              aria-label={t("dashboard.markdownImport.source")}
              className={styles.sourceEditor}
              name="markdown"
              onChange={(event) => {
                setMarkdown(event.target.value);
                setResult(undefined);
              }}
              spellCheck={false}
              value={markdown}
            />
            <div className={styles.sourceFooter}>
              <div className={styles.dialectGroup}>
                <Segmented
                  onChange={(value) => {
                    setDialect(value as ResumeMarkdownDialect);
                    setResult(undefined);
                  }}
                  options={[
                    {
                      label: t("dashboard.markdownImport.dialect.auto"),
                      value: "auto",
                    },
                    {
                      label: t("dashboard.markdownImport.dialect.mujicv"),
                      value: "mujicv",
                    },
                  ]}
                  value={dialect}
                />
                <span className={styles.dialectHint}>
                  {t("dashboard.markdownImport.dialect.more")}
                </span>
              </div>
              <Button onClick={parseSource} type="primary">
                {t("dashboard.markdownImport.parse")}
              </Button>
            </div>
          </section>

          <section className={styles.column}>
            <div className={styles.toolbar}>
              <span className={styles.columnTitle}>
                {t("dashboard.markdownImport.preview")}
              </span>
              {result && !hasBlockingDiagnostic(result) ? (
                <span className={styles.previewSummary}>
                  <Tag>
                    {t("dashboard.markdownImport.sectionCount", {
                      count: result.report.sectionCount,
                    })}
                  </Tag>
                </span>
              ) : null}
            </div>
            <div className={styles.previewShell}>
              {result && !hasBlockingDiagnostic(result) ? (
                <div className={styles.previewDocument}>
                  <ResumeRenderer
                    document={result.document}
                    mode="view"
                    zoom={PREVIEW_SCALE}
                  />
                </div>
              ) : (
                <div className={styles.emptyPreview}>
                  <div className={styles.emptyPreviewInner}>
                    <FileTextOutlined />
                    <span>{t("dashboard.markdownImport.emptyPreview")}</span>
                  </div>
                </div>
              )}
            </div>
            {result?.report.diagnostics.length ? (
              <div className={styles.diagnostics}>
                {result.report.diagnostics.map((diagnostic, index) => (
                  <Alert
                    className={styles.diagnostic}
                    icon={
                      diagnostic.severity === "warning" ? (
                        <WarningOutlined />
                      ) : undefined
                    }
                    key={`${diagnostic.code}-${diagnostic.line}-${index}`}
                    showIcon
                    title={diagnosticMessage(diagnostic)}
                    type={diagnostic.severity}
                  />
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </form>
    </Modal>
  );
}

export function ResumeMarkdownImportDialog({
  afterOpenChange,
  createAction,
  onClose,
  open,
  returnTo,
}: {
  afterOpenChange?: (open: boolean) => void;
  createAction: string;
  onClose: () => void;
  open: boolean;
  returnTo: string;
}) {
  return (
    <ResumeMarkdownImportDialogContent
      afterOpenChange={afterOpenChange}
      createAction={createAction}
      onClose={onClose}
      open={open}
      returnTo={returnTo}
    />
  );
}
