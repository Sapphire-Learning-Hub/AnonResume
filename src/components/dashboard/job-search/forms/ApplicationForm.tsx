"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button, Form, Input, Select } from "antd";
import type { JobApplication, Opportunity } from "@/domain/job-search/schema";
import type { ResumeCatalogEntry } from "@/lib/resume/catalog";
import { fetchResumeEntriesPage } from "@/lib/resume/client";
import { useI18n } from "@/i18n/I18nProvider";
import { JobPicker } from "@/components/dashboard/job-search/JobPicker";
import { useJobFeedback } from "@/components/dashboard/job-search/useJobSearch";
import { useJobSearchStyles } from "@/components/dashboard/job-search/styles";
export function ApplicationForm({
  initial,
  opportunity,
  onSave,
  onCancel,
}: {
  initial?: JobApplication;
  opportunity?: Opportunity;
  onSave: (input: {
    operationId: string;
    opportunityId?: string;
    channel: string;
    notes: string;
    resumeId: string | null;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useJobSearchStyles();
  const feedback = useJobFeedback();
  const [job, setJob] = useState(opportunity);
  const [form] = Form.useForm<{
    channel: string;
    notes: string;
    resumeId: string | null;
  }>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const operation = useRef(crypto.randomUUID());
  const [resumes, setResumes] = useState<ResumeCatalogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [resumePage, setResumePage] = useState({ page: 1, totalPages: 0 });
  const [resumeLoading, setResumeLoading] = useState(false);
  const reportError = useEffectEvent((error: unknown) => feedback.error(error));
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    let active = true;
    const timer = setTimeout(() => {
      setResumeLoading(true);
      void fetchResumeEntriesPage({ page: 1, pageSize: 20, query })
        .then((result) => {
          if (active) {
            setResumes(result.items);
            setResumePage({ page: 1, totalPages: result.totalPages });
          }
        })
        .catch((error) => {
          if (active) reportError(error);
        })
        .finally(() => {
          if (active) setResumeLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        channel: initial?.channel ?? "",
        notes: initial?.notes ?? "",
        resumeId: initial?.resumeId ?? null,
      }}
      onValuesChange={() => {
        operation.current = crypto.randomUUID();
      }}
      onFinish={async (values) => {
        if (lock.current || (!initial && !job)) return;
        lock.current = true;
        setBusy(true);
        try {
          await onSave({
            ...values,
            resumeId: values.resumeId ?? null,
            opportunityId: job?.id,
            operationId: operation.current,
          });
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      {!initial ? (
        <Form.Item label={t("jobs.job")} required>
          <JobPicker
            value={job}
            allowClear={false}
            onChange={(value) => {
              setJob(value);
              operation.current = crypto.randomUUID();
            }}
          />
        </Form.Item>
      ) : null}
      <Form.Item name="channel" label={t("jobs.channel")}>
        <Input maxLength={100} />
      </Form.Item>
      <Form.Item name="resumeId" label={t("jobs.resume")}>
        <Select
          allowClear
          placeholder={t("jobs.noResume")}
          loading={resumeLoading}
          showSearch={{ filterOption: false, onSearch: setQuery }}
          options={[
            ...(initial?.resumeId &&
            !resumes.some((row) => row.id === initial.resumeId)
              ? [
                  {
                    value: initial.resumeId,
                    label: initial.resumeName ?? t("jobs.resumeUnavailable"),
                  },
                ]
              : []),
            ...resumes.map((row) => ({ value: row.id, label: row.title })),
          ]}
          popupRender={(menu) => (
            <>
              {menu}
              {resumePage.page < resumePage.totalPages ? (
                <Button
                  onClick={async () => {
                    if (resumeLoading) return;
                    setResumeLoading(true);
                    const current = generation.current;
                    try {
                      const page = await fetchResumeEntriesPage({
                        page: resumePage.page + 1,
                        pageSize: 20,
                        query,
                      });
                      if (current !== generation.current) return;
                      setResumes((old) => [
                        ...old,
                        ...page.items.filter(
                          (row) =>
                            !old.some((existing) => existing.id === row.id),
                        ),
                      ]);
                      setResumePage({
                        page: page.page,
                        totalPages: page.totalPages,
                      });
                    } catch (error) {
                      feedback.error(error);
                    } finally {
                      if (current === generation.current)
                        setResumeLoading(false);
                    }
                  }}
                >
                  {t("jobs.more")}
                </Button>
              ) : null}
            </>
          )}
        />
      </Form.Item>
      <Form.Item name="notes" label={t("jobs.notes")}>
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 8 }}
          maxLength={8000}
        />
      </Form.Item>
      <div className={styles.actions}>
        <Button onClick={onCancel}>{t("jobs.cancel")}</Button>
        <Button
          type="primary"
          aria-label={t("jobs.save")}
          htmlType="submit"
          disabled={!initial && !job}
          loading={busy}
        >
          {t("jobs.save")}
        </Button>
      </div>
    </Form>
  );
}
