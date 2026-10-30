"use client";
import { InlineMetadata } from "@/components/ui/InlineMetadata";
import { useCallback, useState, useRef, useEffect } from "react";
import { Button, Empty, Spin } from "antd";
import type {
  JobSearchQuery,
  JobApplication,
} from "@/domain/job-search/schema";
import { fetchJobApplications } from "@/lib/job-search/client";
import { useI18n } from "@/i18n/I18nProvider";
import { useJobFeedback, useJobResource } from "./useJobSearch";
import { useJobSearchStyles } from "./styles";
import { stageLabelKey } from "./inputs";
export function ApplicationList({
  query,
  onSelect,
}: {
  query: Partial<JobSearchQuery>;
  onSelect: (job: JobApplication) => void;
}) {
  const { t, locale } = useI18n();
  const { styles } = useJobSearchStyles();
  const feedback = useJobFeedback();
  const load = useCallback(
    (signal: AbortSignal) => fetchJobApplications(query, signal),
    [query],
  );
  const state = useJobResource(load);
  const [more, setMore] = useState(false);
  const moreLock = useRef(false);
  const current = useRef(query);
  useEffect(() => {
    current.current = query;
  }, [query]);
  if (state.loading && !state.data)
    return <Spin aria-label={t("jobs.loading")} />;
  if (state.failed)
    return (
      <Empty description={t("jobs.loadError")}>
        <Button onClick={state.reload}>{t("jobs.retry")}</Button>
      </Empty>
    );
  return (
    <div className={styles.stack}>
      <span className={styles.muted}>
        {t("jobs.count", { count: state.data?.total ?? 0 })}
      </span>
      {state.loading ? <Spin /> : null}
      {!state.data?.items.length ? (
        <Empty description={t("jobs.empty")} />
      ) : (
        state.data.items.map((job) => (
          <article className={styles.record} key={job.id}>
            <div>
              <Button
                type="link"
                className={styles.recordButton}
                onClick={() => onSelect(job)}
              >
                {job.snapshot.title}
              </Button>
              <div className={styles.muted}>
                <InlineMetadata>
                {job.snapshot.company ? <span>{job.snapshot.company}</span> : null}
                <span>{job.rejectedFromStage
                  ? t("jobs.rejectedFrom", {
                      stage: t(stageLabelKey(job.rejectedFromStage)),
                    })
                  : t(stageLabelKey(job.stage))}</span>
                </InlineMetadata>
              </div>
              <div className={styles.muted}>
                <InlineMetadata>
                  <span>{job.appliedAt ? new Date(job.appliedAt).toLocaleString(locale) : t("jobs.noDate")}</span>
                  {job.channel ? <span>{job.channel}</span> : null}
                </InlineMetadata>
              </div>
              <div className={styles.muted}>
                <InlineMetadata><span>{t("jobs.activityAt")}</span><time>{new Date(job.activityAt).toLocaleString(locale)}</time></InlineMetadata>
              </div>
            </div>
            <Button onClick={() => onSelect(job)}>{t("jobs.details")}</Button>
          </article>
        ))
      )}
      {state.data?.nextCursor ? (
        <Button
          loading={more}
          onClick={async () => {
            if (moreLock.current) return;
            moreLock.current = true;
            setMore(true);
            const captured = query;
            try {
              const next = await fetchJobApplications({
                ...query,
                cursor: state.data!.nextCursor!,
              });
              if (current.current === captured)
                state.setData((old) =>
                  old
                    ? {
                        ...next,
                        items: [
                          ...old.items,
                          ...next.items.filter(
                            (row) =>
                              !old.items.some((item) => item.id === row.id),
                          ),
                        ],
                      }
                    : next,
                );
            } catch (error) {
              feedback.error(error);
            } finally {
              moreLock.current = false;
              setMore(false);
            }
          }}
        >
          {t("jobs.more")}
        </Button>
      ) : null}
    </div>
  );
}
