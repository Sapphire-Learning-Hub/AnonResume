"use client";
import { useRef, useState } from "react";
import { Button, Form, Input } from "antd";
import type { ApplicationEvent } from "@/domain/job-search/schema";
import { useI18n } from "@/i18n/I18nProvider";
import {
  fromLocalDateInput,
  localDateInput,
} from "@/components/dashboard/job-search/inputs";
import { useJobSearchStyles } from "@/components/dashboard/job-search/styles";
export function FollowupForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ApplicationEvent;
  onSave: (input: {
    body: string;
    occurredAt: string;
    operationId: string;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useJobSearchStyles();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const operation = useRef(crypto.randomUUID());
  return (
    <Form<{ body: string; date: string }>
      layout="vertical"
      initialValues={{
        body: initial?.body ?? "",
        date: localDateInput(initial?.occurredAt ?? new Date()),
      }}
      onValuesChange={() => {
        operation.current = crypto.randomUUID();
      }}
      onFinish={async (values) => {
        if (lock.current) return;
        const occurredAt =
          initial && values.date === localDateInput(initial.occurredAt)
            ? initial.occurredAt
            : fromLocalDateInput(values.date);
        if (!occurredAt) return;
        lock.current = true;
        setBusy(true);
        try {
          await onSave({
            body: values.body,
            occurredAt,
            operationId: operation.current,
          });
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <Form.Item
        name="body"
        label={t("jobs.followupBody")}
        rules={[
          { required: true, whitespace: true, message: t("jobs.required") },
        ]}
      >
        <Input.TextArea
          maxLength={8000}
          autoSize={{ minRows: 3, maxRows: 8 }}
        />
      </Form.Item>
      <Form.Item
        name="date"
        label={t("jobs.occurredAt")}
        rules={[{ required: true, message: t("jobs.required") }]}
      >
        <Input type="datetime-local" />
      </Form.Item>
      <div className={styles.actions}>
        <Button onClick={onCancel}>{t("jobs.cancel")}</Button>
        <Button
          type="primary"
          htmlType="submit"
          loading={busy}
          aria-label={t("jobs.save")}
        >
          {t("jobs.save")}
        </Button>
      </div>
    </Form>
  );
}
