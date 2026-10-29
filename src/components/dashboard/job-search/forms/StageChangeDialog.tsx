"use client";
import { useClosingDialog } from "@/components/dashboard/job-search/useClosingDialog";
import { useRef, useState } from "react";
import { Button, Checkbox, Form, Input, Modal } from "antd";
import type {
  ApplicationStage,
  JobApplication,
} from "@/domain/job-search/schema";
import { useI18n } from "@/i18n/I18nProvider";
import {
  fromLocalDateInput,
  localDateInput,
  stageLabelKey,
} from "@/components/dashboard/job-search/inputs";
import { useJobSearchStyles } from "@/components/dashboard/job-search/styles";
export function StageChangeDialog({
  application,
  target,
  open,
  onSave,
  onCancel,
}: {
  application: JobApplication;
  target: ApplicationStage;
  open: boolean;
  onSave: (input: {
    stage: ApplicationStage;
    appliedAt?: string;
    confirmReset: boolean;
    operationId: string;
    version: number;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const dialog = useClosingDialog(onCancel);
  const { t } = useI18n();
  const { styles } = useJobSearchStyles();
  const [date, setDate] = useState(() =>
    localDateInput(application.appliedAt ?? new Date()),
  );
  const [dateEdited, setDateEdited] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const operation = useRef(crypto.randomUUID());
  const reset = target === "pending" && Boolean(application.appliedAt);
  const needsDate =
    target !== "pending" &&
    (target !== "withdrawn" || Boolean(application.appliedAt));
  async function submit() {
    if (lock.current || (reset && !confirm)) return;
    const appliedAt = needsDate
      ? !dateEdited && application.appliedAt
        ? application.appliedAt
        : fromLocalDateInput(date)
      : undefined;
    if (needsDate && !appliedAt) return;
    lock.current = true;
    setBusy(true);
    try {
      if (
        await onSave({
          stage: target,
          appliedAt,
          confirmReset: confirm,
          operationId: operation.current,
          version: application.version,
        })
      )
        dialog.close();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open && dialog.open}
      afterClose={dialog.afterClose}
      title={`${t("jobs.stageDialog")} · ${t(stageLabelKey(target))}`}
      onCancel={() => dialog.close()}
      footer={null}
      destroyOnHidden
    >
      <Form layout="vertical" onFinish={() => void submit()}>
        {needsDate ? (
          <Form.Item label={t("jobs.appliedAt")} required>
            <Input
              type="datetime-local"
              aria-label={t("jobs.appliedAt")}
              value={date}
              required
              max={localDateInput()}
              onChange={(event) => {
                setDateEdited(true);
                setDate(event.target.value);
                operation.current = crypto.randomUUID();
              }}
            />
          </Form.Item>
        ) : null}
        {reset ? (
          <Checkbox
            checked={confirm}
            onChange={(event) => setConfirm(event.target.checked)}
          >
            {t("jobs.resetConfirmation")}
          </Checkbox>
        ) : null}
        <div className={styles.actions}>
          <Button onClick={() => dialog.close()}>{t("jobs.cancel")}</Button>
          <Button
            type="primary"
            aria-label={t("jobs.save")}
            htmlType="submit"
            loading={busy}
            disabled={reset && !confirm}
          >
            {t("jobs.save")}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
