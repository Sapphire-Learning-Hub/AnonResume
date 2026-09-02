"use client";

import { Button, Progress } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useSyncExternalStore } from "react";

import { useI18n } from "@/i18n/I18nProvider";
import {
  cancelPdfExportTask,
  dismissPdfExportTask,
  getPdfExportTasksServerSnapshot,
  getPdfExportTasksSnapshot,
  refreshPdfExportTask,
  subscribePdfExportTasks,
  type PdfExportClientTask,
} from "@/lib/pdf-export-client";

const useStyles = createStyles(({ css, token }) => ({
  panel: css`
    position: fixed;
    right: 24px;
    bottom: 88px;
    z-index: ${token.zIndexPopupBase + 20};
    display: grid;
    width: min(380px, calc(100vw - 32px));
    max-height: min(520px, calc(100vh - 120px));
    overflow: auto;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgElevated};
    box-shadow: ${token.boxShadowSecondary};

    @media (max-width: 640px) {
      right: 16px;
      bottom: 72px;
    }
  `,
  header: css`
    padding: 16px 18px 12px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    color: ${token.colorText};
    font-size: 15px;
    font-weight: 600;
  `,
  task: css`
    display: grid;
    gap: 10px;
    padding: 14px 18px 16px;

    & + & {
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  row: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    gap: 12px;
  `,
  filename: css`
    min-width: 0;
    overflow: hidden;
    color: ${token.colorText};
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  status: css`
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
    justify-content: flex-end;
  `,
}));

function getStatusText(
  task: PdfExportClientTask,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (task.status === "queued") {
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
    default:
      return task.error || t("pdfExport.error.generic");
  }
}

export function PdfExportTaskOverlay() {
  const { styles } = useStyles();
  const { t } = useI18n();
  const tasks = useSyncExternalStore(
    subscribePdfExportTasks,
    getPdfExportTasksSnapshot,
    getPdfExportTasksServerSnapshot,
  );

  useEffect(() => {
    if (!tasks.some((task) => ["queued", "running"].includes(task.status))) {
      return;
    }

    const refresh = () => {
      for (const task of getPdfExportTasksSnapshot()) {
        void refreshPdfExportTask(task).catch(() => undefined);
      }
    };
    const timer = window.setInterval(refresh, 1_000);

    refresh();
    return () => window.clearInterval(timer);
  }, [tasks]);

  if (tasks.length === 0) {
    return null;
  }

  return (
    <aside aria-live="polite" className={styles.panel}>
      <div className={styles.header}>{t("pdfExport.title")}</div>
      {tasks.map((task) => {
        const active = ["queued", "running"].includes(task.status);

        return (
          <section className={styles.task} key={task.id}>
            <div className={styles.row}>
              <span className={styles.filename}>
                {task.filename || t("common.pdf")}
              </span>
              <span className={styles.status}>{getStatusText(task, t)}</span>
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
            <div className={styles.actions}>
              {active ? (
                <Button
                  disabled={task.cancelRequested}
                  onClick={() => void cancelPdfExportTask(task)}
                  size="small"
                >
                  {t("pdfExport.cancel")}
                </Button>
              ) : (
                <Button
                  onClick={() => dismissPdfExportTask(task.id)}
                  size="small"
                >
                  {t("common.dismiss")}
                </Button>
              )}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
