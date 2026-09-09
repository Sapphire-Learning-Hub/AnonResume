"use client";

import {
  CloseOutlined,
  FilePdfOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Button, FloatButton, Progress } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import {
  cancelPdfExportTask,
  dismissPdfExportTask,
  dismissTerminalPdfExportTasks,
  getPdfExportTasksServerSnapshot,
  getPdfExportTasksSnapshot,
  refreshPdfExportTask,
  subscribePdfExportTasks,
  type PdfExportClientTask,
} from "@/lib/pdf-export-client";

const MAX_QUEUED_POLL_MS = 10_000;
const MAX_ERROR_POLL_MS = 30_000;
const POLL_JITTER_RATIO = 0.2;

const useStyles = createStyles(({ css, token }) => ({
  actionItem: css`
    position: relative;
    width: 40px;
    height: 40px;
  `,
  panel: css`
    position: absolute;
    right: 0;
    bottom: calc(100% + 12px);
    display: grid;
    width: min(380px, calc(100vw - 32px));
    max-height: min(520px, calc(100vh - 128px));
    overflow: auto;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgElevated};
    box-shadow: ${token.boxShadowSecondary};
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px) scale(0.98);
    transform-origin: bottom right;
    visibility: hidden;
    transition:
      opacity 180ms ease,
      transform 180ms ease,
      visibility 0s linear 180ms;

    &[data-open="true"] {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
      visibility: visible;
      transition-delay: 0s;
    }

    @media (prefers-reduced-motion: reduce) {
      transition-duration: 0ms;
    }
  `,
  header: css`
    display: flex;
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px 8px 18px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  headerTitle: css`
    color: ${token.colorText};
    font-size: 15px;
    font-weight: 600;
  `,
  headerActions: css`
    display: flex;
    align-items: center;
    gap: 2px;
  `,
  task: css`
    display: grid;
    gap: 10px;
    padding: 14px 18px 16px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  taskHeader: css`
    display: grid;
    min-width: 0;
    gap: 6px;
  `,
  taskMeta: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    gap: 12px;
  `,
  filename: css`
    display: block;
    min-width: 0;
    overflow: hidden;
    color: ${token.colorText};
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  status: css`
    min-width: 0;
    flex: 1;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    line-height: 1.5;
  `,
  error: css`
    color: ${token.colorError};
    font-size: 13px;
  `,
  actions: css`
    display: flex;
    flex: 0 0 auto;
    justify-content: flex-end;
  `,
  footer: css`
    display: flex;
    justify-content: flex-end;
    padding: 8px 10px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
}));

function getStatusText(
  task: PdfExportClientTask,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (task.status === "queued") {
    if (task.workerAvailable === false) {
      return t("pdfExport.workerUnavailable");
    }

    return t("pdfExport.queued", {
      position: task.position ?? "-",
      count: task.queuedCount,
    });
  }

  if (task.status === "running") {
    return task.cancelRequested
      ? t("pdfExport.cancelling")
      : t("pdfExport.running");
  }

  return t(`pdfExport.${task.status}`);
}

function getErrorText(
  task: PdfExportClientTask,
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (task.errorCode) {
    case "user_queue_limit":
      return t("pdfExport.error.userQueueLimit", {
        limit: task.errorLimit ?? "-",
      });
    case "queue_full":
      return t("pdfExport.error.queueFull");
    case "anonymous_pdf_export_disabled":
      return t("pdfExport.error.anonymousDisabled");
    case "pdf_worker_unavailable":
      return t("pdfExport.error.workerUnavailable");
    default:
      return task.error || t("pdfExport.error.generic");
  }
}

export function PdfExportTaskOverlay() {
  const { styles } = useStyles();
  const { t } = useI18n();
  const { notification } = useAppFeedback();
  const [panelOpen, setPanelOpen] = useState(false);
  const notifiedFailuresRef = useRef(new Set<string>());
  const knownTaskIdsRef = useRef(new Set<string>());
  const queuedPollCountRef = useRef(new Map<string, number>());
  const consecutiveFailuresRef = useRef(0);
  const tasks = useSyncExternalStore(
    subscribePdfExportTasks,
    getPdfExportTasksSnapshot,
    getPdfExportTasksServerSnapshot,
  );
  const hasActiveTasks = tasks.some((task) =>
    ["queued", "running"].includes(task.status),
  );
  const hasFailedTasks = tasks.some((task) => task.status === "failed");
  const hasTerminalTasks = tasks.some((task) =>
    ["completed", "failed", "cancelled"].includes(task.status),
  );

  useEffect(() => {
    const currentIds = new Set(tasks.map((task) => task.id));
    const hasNewTask = tasks.some(
      (task) => !knownTaskIdsRef.current.has(task.id),
    );

    if (hasNewTask) setPanelOpen(true);
    knownTaskIdsRef.current = currentIds;
  }, [tasks]);

  useEffect(() => {
    if (!hasActiveTasks) {
      return;
    }

    let timer: number | undefined;
    let disposed = false;
    let refreshing = false;

    const clearTimer = () => {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      timer = undefined;
    };

    const canPoll = () =>
      document.visibilityState !== "hidden" && navigator.onLine !== false;

    const schedule = (delay: number) => {
      clearTimer();
      const jitter = Math.floor(delay * POLL_JITTER_RATIO * Math.random());
      timer = window.setTimeout(() => void refresh(), delay + jitter);
    };

    const refresh = async () => {
      if (disposed || refreshing || !canPoll()) return;

      refreshing = true;
      const activeTasks = getPdfExportTasksSnapshot().filter((task) =>
        ["queued", "running"].includes(task.status),
      );
      const results = await Promise.all(
        activeTasks.map((task) =>
          refreshPdfExportTask(task).then(
            () => true,
            () => false,
          ),
        ),
      );
      refreshing = false;

      if (disposed) return;

      const nextActiveTasks = getPdfExportTasksSnapshot().filter((task) =>
        ["queued", "running"].includes(task.status),
      );
      if (nextActiveTasks.length === 0) return;

      if (results.some((succeeded) => !succeeded)) {
        consecutiveFailuresRef.current += 1;
        schedule(
          Math.min(
            MAX_ERROR_POLL_MS,
            2_000 * 2 ** consecutiveFailuresRef.current,
          ),
        );
        return;
      }

      consecutiveFailuresRef.current = 0;
      const activeIds = new Set(nextActiveTasks.map((task) => task.id));
      for (const id of queuedPollCountRef.current.keys()) {
        if (!activeIds.has(id)) queuedPollCountRef.current.delete(id);
      }

      const delay = Math.min(
        ...nextActiveTasks.map((task) => {
          const baseDelay = Math.max(1_000, task.pollAfterMs ?? 2_000);

          if (task.status !== "queued" || task.workerAvailable === false) {
            queuedPollCountRef.current.delete(task.id);
            return baseDelay;
          }

          const pollCount = (queuedPollCountRef.current.get(task.id) ?? 0) + 1;
          queuedPollCountRef.current.set(task.id, pollCount);
          return Math.min(
            MAX_QUEUED_POLL_MS,
            baseDelay * 2 ** Math.floor((pollCount - 1) / 2),
          );
        }),
      );
      schedule(delay);
    };

    const handleAvailabilityChange = () => {
      clearTimer();
      if (canPoll()) schedule(0);
    };

    document.addEventListener("visibilitychange", handleAvailabilityChange);
    window.addEventListener("online", handleAvailabilityChange);
    window.addEventListener("offline", handleAvailabilityChange);
    void refresh();
    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleAvailabilityChange);
      window.removeEventListener("online", handleAvailabilityChange);
      window.removeEventListener("offline", handleAvailabilityChange);
    };
  }, [hasActiveTasks]);

  useEffect(() => {
    for (const task of tasks) {
      if (task.status !== "failed" || notifiedFailuresRef.current.has(task.id)) {
        continue;
      }

      notifiedFailuresRef.current.add(task.id);
      notification.error({
        actions: (
          <Button
            size="small"
            onClick={() => {
              dismissPdfExportTask(task.id);
              notification.destroy(`pdf-export-failed-${task.id}`);
            }}
          >
            {t("common.dismiss")}
          </Button>
        ),
        description: getErrorText(task, t),
        duration: false,
        key: `pdf-export-failed-${task.id}`,
        role: "alert",
        title: task.filename || t("common.pdf"),
      });
    }
  }, [notification, t, tasks]);

  if (tasks.length === 0) {
    return null;
  }

  const statusButtonLabel = panelOpen
    ? t("pdfExport.collapseStatus")
    : t("pdfExport.openStatus");
  const statusIcon = hasActiveTasks ? (
    <LoadingOutlined spin />
  ) : hasFailedTasks ? (
    <WarningOutlined />
  ) : (
    <FilePdfOutlined />
  );

  return (
    <div className={styles.actionItem} data-floating-action-item="pdf-export">
      <aside
        aria-hidden={!panelOpen}
        aria-label={t("pdfExport.title")}
        aria-live="polite"
        className={styles.panel}
        data-open={panelOpen}
      >
          <div className={styles.header}>
            <span className={styles.headerTitle}>{t("pdfExport.title")}</span>
            <div className={styles.headerActions}>
              <Button
                aria-label={t("pdfExport.closePanel")}
                icon={<CloseOutlined />}
                size="small"
                type="text"
                onClick={() => setPanelOpen(false)}
              />
            </div>
          </div>
          {tasks.map((task) => {
            const active = ["queued", "running"].includes(task.status);

            return (
              <section className={styles.task} key={task.id}>
                <div className={styles.taskHeader}>
                  <span className={styles.filename}>
                    {task.filename || t("common.pdf")}
                  </span>
                </div>
                <div className={styles.taskMeta}>
                  <span className={styles.status}>{getStatusText(task, t)}</span>
                  {active ? (
                    <div className={styles.actions}>
                      <Button
                        disabled={task.cancelRequested}
                        onClick={() => void cancelPdfExportTask(task)}
                        size="small"
                      >
                        {t("pdfExport.cancel")}
                      </Button>
                    </div>
                  ) : null}
                </div>
                {active ? (
                  <Progress
                    percent={task.status === "running" ? 70 : 24}
                    showInfo={false}
                    status="active"
                  />
                ) : null}
                {task.error || task.errorCode ? (
                  <div className={styles.error}>{getErrorText(task, t)}</div>
                ) : null}
              </section>
            );
          })}
          {hasTerminalTasks ? (
            <div className={styles.footer}>
              <Button
                size="small"
                type="text"
                onClick={() => dismissTerminalPdfExportTasks()}
              >
                {t("pdfExport.clearHistory")}
              </Button>
            </div>
          ) : null}
      </aside>
      <FloatButton
        aria-expanded={panelOpen}
        aria-label={statusButtonLabel}
        badge={{ count: tasks.length }}
        icon={statusIcon}
        tooltip={<span>{statusButtonLabel}</span>}
        type="default"
        onClick={() => setPanelOpen((open) => !open)}
      />
    </div>
  );
}
