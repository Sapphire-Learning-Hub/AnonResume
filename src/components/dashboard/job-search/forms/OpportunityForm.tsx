"use client";
import { InlineMetadata } from "@/components/ui/InlineMetadata";
import { useRef, useState } from "react";
import { Button, Checkbox, Form, Input } from "antd";
import type { JobFields, Opportunity } from "@/domain/job-search/schema";
import { useI18n } from "@/i18n/I18nProvider";
import { fetchJobCandidates } from "@/lib/job-search/client";
import { useJobFeedback } from "@/components/dashboard/job-search/useJobSearch";
import { useJobSearchStyles } from "@/components/dashboard/job-search/styles";
export interface OpportunityFormProps {
  initial?: Partial<JobFields>;
  editing?: boolean;
  onSave: (
    fields: JobFields,
    createPending: boolean,
    operationId: string,
  ) => Promise<boolean>;
  onCancel: () => void;
  onUseExisting?: (job: Opportunity) => void;
  submitLabel?: string;
  readonlyDescription?: boolean;
}
export function OpportunityForm({
  initial,
  editing = false,
  onSave,
  onCancel,
  onUseExisting,
  submitLabel,
  readonlyDescription = false,
}: OpportunityFormProps) {
  const { t } = useI18n();
  const { styles } = useJobSearchStyles();
  const feedback = useJobFeedback();
  const [form] = Form.useForm<JobFields>();
  const [pending, setPending] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const operationId = useRef(crypto.randomUUID());
  const [candidates, setCandidates] = useState<Opportunity[]>();
  const [checked, setChecked] = useState(false);
  async function submit(fields: JobFields, force = false) {
    if (lock.current || (!editing && candidates?.length && !force)) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!editing && !checked && !force && fields.description?.trim()) {
        const found = await fetchJobCandidates(fields.description);
        setChecked(true);
        if (found.items.length) {
          setCandidates(found.items);
          return;
        }
      }
      await onSave(fields, pending, operationId.current);
    } catch (error) {
      feedback.error(error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        title: "",
        company: "",
        description: "",
        url: "",
        source: "",
        notes: "",
        ...initial,
      }}
      onValuesChange={() => {
        operationId.current = crypto.randomUUID();
        setChecked(false);
        setCandidates(undefined);
      }}
      onFinish={(fields) => void submit(fields)}
    >
      <Form.Item
        name="title"
        label={t("jobs.jobTitle")}
        rules={[
          { required: true, whitespace: true, message: t("jobs.required") },
          { max: 200 },
        ]}
      >
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item name="company" label={t("jobs.company")}>
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item name="description" label={t("jobs.description")}>
        <Input.TextArea
          readOnly={readonlyDescription}
          autoSize={{ minRows: 6, maxRows: 12 }}
          maxLength={16000}
        />
      </Form.Item>
      <Form.Item
        name="url"
        label={t("jobs.url")}
        rules={[
          {
            validator: (_, value: unknown) => {
              if (!value) return Promise.resolve();
              try {
                const url = new URL(String(value));
                if (
                  ["http:", "https:"].includes(url.protocol) &&
                  !url.username &&
                  !url.password
                )
                  return Promise.resolve();
              } catch {}
              return Promise.reject(new Error(t("jobs.invalidUrl")));
            },
          },
        ]}
      >
        <Input maxLength={2048} />
      </Form.Item>
      <Form.Item name="source" label={t("jobs.source")}>
        <Input maxLength={100} />
      </Form.Item>
      <Form.Item name="notes" label={t("jobs.notes")}>
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 6 }}
          maxLength={8000}
        />
      </Form.Item>
      {!editing ? (
        <Checkbox
          checked={pending}
          onChange={(e) => {
            setPending(e.target.checked);
            operationId.current = crypto.randomUUID();
          }}
        >
          {t("jobs.createPending")}
        </Checkbox>
      ) : null}
      {candidates?.length ? (
        <section className={styles.stack} aria-label={t("jobs.duplicate")}>
          <strong>{t("jobs.duplicate")}</strong>
          {candidates.map((job) => (
            <div className={styles.record} key={job.id}>
              <span>
                <InlineMetadata>{job.company ? <span>{job.company}</span> : null}<span>{job.title}</span></InlineMetadata>
              </span>
              {onUseExisting ? (
                <Button onClick={() => onUseExisting(job)}>
                  {t("jobs.useExisting")}
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            loading={busy}
            onClick={() =>
              void form
                .validateFields()
                .then((fields) => submit(fields, true))
                .catch(() => undefined)
            }
          >
            {t("jobs.createAnyway")}
          </Button>
        </section>
      ) : null}
      <div className={styles.actions}>
        <Button onClick={onCancel} disabled={busy}>
          {t("jobs.cancel")}
        </Button>
        <Button
          type="primary"
          htmlType="submit"
          disabled={!editing && Boolean(candidates?.length)}
          aria-label={submitLabel ?? t("jobs.save")}
          loading={busy}
        >
          {submitLabel ?? t("jobs.save")}
        </Button>
      </div>
    </Form>
  );
}
