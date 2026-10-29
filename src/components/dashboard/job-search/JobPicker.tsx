"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Select, Spin } from "antd";
import type { Opportunity } from "@/domain/job-search/schema";
import { fetchJobOpportunities } from "@/lib/job-search/client";
import { useI18n } from "@/i18n/I18nProvider";
import { useJobFeedback, useJobResource } from "./useJobSearch";
import { useJobSearchStyles } from "./styles";
export function JobPicker({
  value,
  onChange,
  disabled,
  allowClear = true,
}: {
  value?: Opportunity;
  onChange: (job: Opportunity | undefined) => void;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  const { t } = useI18n();
  const { styles } = useJobSearchStyles();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const feedback = useJobFeedback();
  const [more, setMore] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    const timer = setTimeout(() => setQuery(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const load = useCallback(
    (signal: AbortSignal) =>
      fetchJobOpportunities({ q: query, archived: "all" }, signal),
    [query],
  );
  const resource = useJobResource(load);
  const rows = resource.data?.items ?? [];
  const options =
    value && !rows.some((job) => job.id === value.id) ? [value, ...rows] : rows;
  return (
    <Select
      className={styles.full}
      aria-label={t("jobs.chooseJob")}
      placeholder={t("jobs.chooseJob")}
      allowClear={allowClear}
      showSearch={{ filterOption: false, onSearch: setSearch }}
      value={value?.id}
      disabled={disabled}
      loading={resource.loading || more}
      options={options.map((job) => ({
        value: job.id,
        label: `${job.company ? `${job.company} · ` : ""}${job.title}`,
      }))}
      onChange={(id) => onChange(options.find((job) => job.id === id))}
      popupRender={(menu) => (
        <>
          {menu}
          {resource.failed ? (
            <Button onClick={resource.reload}>{t("jobs.retry")}</Button>
          ) : null}
          {resource.data?.nextCursor ? (
            <Button
              loading={more}
              onClick={async () => {
                if (more) return;
                setMore(true);
                const current = generation.current;
                try {
                  const next = await fetchJobOpportunities({
                    q: query,
                    archived: "all",
                    cursor: resource.data!.nextCursor!,
                  });
                  if (current === generation.current)
                    resource.setData((old) =>
                      old
                        ? {
                            ...next,
                            items: [
                              ...old.items,
                              ...next.items.filter(
                                (job) =>
                                  !old.items.some(
                                    (existing) => existing.id === job.id,
                                  ),
                              ),
                            ],
                          }
                        : next,
                    );
                } catch (error) {
                  feedback.error(error);
                } finally {
                  setMore(false);
                }
              }}
            >
              {t("jobs.more")}
            </Button>
          ) : null}
          {resource.loading ? <Spin size="small" /> : null}
        </>
      )}
    />
  );
}
