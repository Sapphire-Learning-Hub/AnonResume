"use client";

import { Modal, Spin } from "antd";
import { useMemo, type ReactNode } from "react";

import { createResumeDiffPresentation } from "@/components/resume/resume-diff-presentation";
import { compareResumeDocuments } from "@/domain/resume/document-diff";
import type { ResumeDocument } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";

import { ResumeDiffCanvas } from "./ResumeDiffCanvas";
import { useResumeVersionDiffPromptStyles } from "./ResumeVersionDiffPrompt.style";

export function ResumeDocumentDiffModal({
  footer,
  loading = false,
  loadingMessage,
  onCancel,
  open,
  sourceDocument,
  sourceLabel,
  targetDocument,
  targetLabel,
  title,
}: {
  footer: ReactNode;
  loading?: boolean;
  loadingMessage: string;
  onCancel: () => void;
  open: boolean;
  sourceDocument?: ResumeDocument;
  sourceLabel: string;
  targetDocument: ResumeDocument;
  targetLabel: string;
  title: string;
}) {
  const { styles } = useResumeVersionDiffPromptStyles();
  const { t } = useI18n();
  const result = useMemo(
    () =>
      sourceDocument
        ? compareResumeDocuments(sourceDocument, targetDocument)
        : undefined,
    [sourceDocument, targetDocument],
  );
  const presentation = useMemo(
    () => (result ? createResumeDiffPresentation(result) : undefined),
    [result],
  );

  return (
    <Modal
      centered
      className={styles.modal}
      destroyOnHidden
      footer={footer}
      open={open}
      title={title}
      width="min(96vw, 1760px)"
      onCancel={onCancel}
    >
      <div className={styles.modalContent}>
        {loading ? (
          <div className={styles.stateMessage}>
            <Spin description={loadingMessage} />
          </div>
        ) : null}
        {!loading && result && presentation && sourceDocument ? (
          result.summary.total === 0 ? (
            <div className={styles.stateMessage}>{t("editor.diff.noChanges")}</div>
          ) : (
            <ResumeDiffCanvas
              sourceDocument={sourceDocument}
              sourceLabel={sourceLabel}
              targetDocument={targetDocument}
              targetLabel={targetLabel}
              result={result}
              presentation={presentation}
            />
          )
        ) : null}
      </div>
    </Modal>
  );
}
