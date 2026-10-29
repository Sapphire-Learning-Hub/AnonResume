"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { useI18n } from "@/i18n/I18nProvider";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { jobErrorCodes } from "@/lib/job-search/errors";
import { JobRequestError } from "@/lib/job-search/client";
export function useJobFeedback() {
  const { t } = useI18n();
  const { failure, toast } = useAppFeedback();
  return {
    success: () =>
      toast.success({ key: "job-search-result", content: t("jobs.saved") }),
    error: (error: unknown, retry?: () => void) => {
      const code = error instanceof JobRequestError ? error.code : "unknown";
      const known = jobErrorCodes.find((value) => value === code);
      const key = known
        ? (`jobs.error.${known}` as const)
        : code === "unauthorized"
          ? "jobs.error.unauthorized"
          : "jobs.error.unknown";
      failure(error, {
        key: "job-search-error",
        title: t("jobs.title"),
        description: t(key),
        duration: false,
        ...(retry
          ? {
              actions: (
                <Button size="small" onClick={retry}>
                  {t("jobs.retry")}
                </Button>
              ),
            }
          : {}),
      });
    },
  };
}
export function useJobMutation() {
  const feedback = useJobFeedback();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  async function perform<T>(
    work: () => Promise<T>,
    retry?: () => void,
  ): Promise<T | undefined> {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await work();
      feedback.success();
      return result;
    } catch (error) {
      feedback.error(error, retry);
      return undefined;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, perform };
}
export function useJobResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return;
        setLoading(true);
        setFailed(false);
        return loader(controller.signal);
      })
      .then((value) => {
        if (!controller.signal.aborted && value !== undefined) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loader, revision]);
  return { data, setData, loading, failed, reload };
}
