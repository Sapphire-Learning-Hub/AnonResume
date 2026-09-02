"use client";

import { Button, Input, Modal, type ButtonProps } from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";

import { useI18n } from "@/i18n/I18nProvider";
import { updateResumeSummary } from "@/lib/resume-client";

export interface ResumeSummaryUpdateResult {
  summary: string;
  updatedAt: number;
  version: number;
}

const useStyles = createStyles(({ token, css }) => ({
  content: css`
    display: grid;
    gap: 10px;
  `,
  description: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    line-height: 1.6;
  `,
  count: css`
    justify-self: end;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1;
  `,
  error: css`
    margin: 0;
    color: ${token.colorError};
    font-size: 13px;
  `,
}));

export function ResumeSummaryEditor({
  initialSummary,
  onBeforeOpen,
  onOpenChange,
  onSaved,
  open: controlledOpen,
  prepareSave,
  renderTrigger = true,
  resumeId,
  saveSummary = updateResumeSummary,
  triggerType = "link",
  version,
}: {
  initialSummary: string;
  onBeforeOpen?: () => void;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (result: ResumeSummaryUpdateResult) => void;
  open?: boolean;
  prepareSave?: () => Promise<number>;
  renderTrigger?: boolean;
  resumeId: string;
  saveSummary?: (params: {
    resumeId: string;
    summary: string;
    version: number;
  }) => Promise<ResumeSummaryUpdateResult>;
  triggerType?: ButtonProps["type"];
  version: number;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  const [draft, setDraft] = useState(initialSummary);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const open = controlledOpen ?? internalOpen;

  function setOpen(nextOpen: boolean) {
    if (controlledOpen === undefined) {
      setInternalOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  }

  function handleOpen() {
    onBeforeOpen?.();
    setDraft(initialSummary);
    setError(false);
    setOpen(true);
  }

  async function handleSave() {
    const summary = draft.trim();

    if (!summary || saving) {
      return;
    }

    setSaving(true);
    setError(false);

    try {
      const resolvedVersion = prepareSave ? await prepareSave() : version;
      const result = await saveSummary({ resumeId, summary, version: resolvedVersion });

      onSaved?.(result);
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {renderTrigger ? (
        <Button onClick={handleOpen} type={triggerType}>
          {t("dashboard.editSummary")}
        </Button>
      ) : null}
      <Modal
        cancelText={t("common.dismiss")}
        confirmLoading={saving}
        destroyOnHidden
        okButtonProps={{ disabled: !draft.trim() }}
        okText={t("dashboard.saveSummary")}
        open={open}
        title={t("dashboard.editSummaryTitle")}
        onCancel={() => setOpen(false)}
        onOk={() => void handleSave()}
      >
        <div className={styles.content}>
          <p className={styles.description}>
            {t("dashboard.summaryDescription")}
          </p>
          <Input.TextArea
            aria-label={t("dashboard.summaryField")}
            autoFocus
            maxLength={160}
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <span aria-live="polite" className={styles.count}>
            {draft.length} / 160
          </span>
          {error ? (
            <p className={styles.error} role="alert">
              {t("dashboard.summarySaveError")}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
