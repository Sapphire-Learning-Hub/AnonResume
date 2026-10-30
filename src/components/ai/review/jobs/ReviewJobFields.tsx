"use client";
import { useCallback, useRef, useState } from "react";
import { Button, Empty, Select } from "antd";
import type { Opportunity } from "@/domain/job-search/schema";
import { fetchJobApplications } from "@/lib/job-search/client";
import { JobPicker } from "@/components/dashboard/job-search/JobPicker";
import {
  useJobFeedback,
  useJobResource,
} from "@/components/dashboard/job-search/useJobSearch";
import { stageLabelKey } from "@/components/dashboard/job-search/inputs";
import { useI18n } from "@/i18n/I18nProvider";
import { useAiReviewStyles } from "@/components/ai/review/AiReview.style";
function ApplicationPicker({
  job,
  value,
  onChange,
  disabled,
}: {
  job: Opportunity;
  value?: string;
  onChange: (id?: string) => void;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  const feedback = useJobFeedback();
  const state = useJobResource(
    useCallback(
      (signal: AbortSignal) =>
        fetchJobApplications(
          { opportunityId: job.id, archived: "all" },
          signal,
        ),
      [job.id],
    ),
  );
  const [more, setMore] = useState(false);
  const lock = useRef(false);
  return (
    <Select
      aria-label={t("jobs.chooseApplication")}
      placeholder={t("jobs.noApplication")}
      allowClear
      value={value}
      disabled={disabled}
      loading={state.loading || more}
      onChange={onChange}
      options={state.data?.items.map((app) => ({
        value: app.id,
        label: `${t(stageLabelKey(app.stage))} (${new Date(app.createdAt).toLocaleString(locale)}${app.channel ? `, ${app.channel}` : ""})`,
      }))}
      notFoundContent={
        state.failed ? (
          <Empty description={t("jobs.loadError")}>
            <Button onClick={state.reload}>{t("jobs.retry")}</Button>
          </Empty>
        ) : undefined
      }
      popupRender={(menu) => (
        <>
          {menu}
          {state.data?.nextCursor ? (
            <Button
              loading={more}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setMore(true);
                try {
                  const next = await fetchJobApplications({
                    opportunityId: job.id,
                    archived: "all",
                    cursor: state.data!.nextCursor!,
                  });
                  state.setData((old) =>
                    old
                      ? {
                          ...next,
                          items: [
                            ...old.items,
                            ...next.items.filter(
                              (app) =>
                                !old.items.some((row) => row.id === app.id),
                            ),
                          ],
                        }
                      : next,
                  );
                } catch (error) {
                  feedback.error(error);
                } finally {
                  lock.current = false;
                  setMore(false);
                }
              }}
            >
              {t("jobs.more")}
            </Button>
          ) : null}
        </>
      )}
    />
  );
}
export function ReviewJobFields({
  job,
  applicationId,
  disabled,
  onJob,
  onApplication,
}: {
  job?: Opportunity;
  applicationId?: string;
  disabled: boolean;
  onJob: (job?: Opportunity) => void;
  onApplication: (id?: string) => void;
}) {
  const { t } = useI18n();
  const { styles } = useAiReviewStyles();
  return (
    <>
      <label className={styles.field}>
        <span>{t("jobs.chooseJob")}</span>
        <JobPicker value={job} disabled={disabled} onChange={onJob} />
      </label>
      {job ? (
        <label className={styles.field}>
          <span>{t("jobs.chooseApplication")}</span>
          <ApplicationPicker
            key={job.id}
            job={job}
            value={applicationId}
            disabled={disabled}
            onChange={onApplication}
          />
        </label>
      ) : null}
    </>
  );
}
