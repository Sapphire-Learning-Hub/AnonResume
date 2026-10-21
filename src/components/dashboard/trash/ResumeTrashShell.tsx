"use client";

import { Button, Empty, Input, Pagination, Result, Table, Tag } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppRouteLink } from "@/components/ui/AppRouteLoading";
import { ActionConfirmationModal } from "@/components/ui/ActionConfirmationModal";
import { useAppFeedback } from "@/components/ui/useAppFeedback";
import { useI18n } from "@/i18n/I18nProvider";
import {
  fetchResumeTrashPage,
  purgeTrashedResumeClient,
  restoreTrashedResumeClient,
  ResumeTrashClientError,
} from "@/lib/resume/trash/client";
import type { ResumeTrashEntry } from "@/lib/resume/trash/types";
import type { PageResult } from "@/lib/shared/pagination";
import { useStyles } from "./styles";

type LoadPage = typeof fetchResumeTrashPage;
export function ResumeTrashShell({
  initialPage,
  initialQuery = "",
  loadPage = fetchResumeTrashPage,
  restoreResume = restoreTrashedResumeClient,
  purgeResume = purgeTrashedResumeClient,
}: {
  initialPage?: PageResult<ResumeTrashEntry>;
  initialQuery?: string;
  loadPage?: LoadPage;
  restoreResume?: (id: string) => Promise<void>;
  purgeResume?: (id: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const { styles } = useStyles();
  const { toast, notification } = useAppFeedback();
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(!initialPage);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const activeQuery = useRef(initialQuery);
  const sequence = useRef(0);
  const initialized = useRef(Boolean(initialPage));
  const [selected, setSelected] = useState<ResumeTrashEntry>();
  const [pending, setPending] = useState<string>();
  const load = useCallback(
    async (number: number) => {
      const current = ++sequence.current;
      setLoading(true);
      setLoadFailed(false);
      try {
        const result = await loadPage({
          page: number,
          pageSize: 20,
          query: activeQuery.current,
        });
        if (current === sequence.current) setPage(result);
      } catch {
        if (current === sequence.current) setLoadFailed(true);
      } finally {
        if (current === sequence.current) setLoading(false);
      }
    },
    [loadPage],
  );
  const invalidateRequests = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    if (!initialized.current) void load(1);
    return invalidateRequests;
  }, [invalidateRequests, load]);

  async function perform(entry: ResumeTrashEntry, action: "restore" | "purge") {
    if (pending) return;
    setPending(entry.id);
    try {
      await (action === "restore" ? restoreResume : purgeResume)(entry.id);
      notification.destroy("resume-trash-operation");
      setSelected(undefined);
      setPage((current) =>
        current
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== entry.id),
              total: Math.max(0, current.total - 1),
            }
          : current,
      );
      toast.success({
        key: "resume-trash-operation",
        content: t(action === "restore" ? "trash.restored" : "trash.purged"),
      });
      await load(page?.page ?? 1);
    } catch (error) {
      const code =
        error instanceof ResumeTrashClientError ? error.code : "unknown";
      const message =
        code === "resume_trash_busy"
          ? "trash.busy"
          : code === "resume_trash_expired"
            ? "trash.expiredError"
            : code === "unauthorized"
              ? "trash.sessionError"
              : "trash.operationError";
      notification.error({
        key: "resume-trash-operation",
        duration: false,
        title: t(message),
        actions: (
          <Button onClick={() => void load(page?.page ?? 1)}>
            {t("trash.refresh")}
          </Button>
        ),
      });
    } finally {
      setPending(undefined);
    }
  }
  const date = (value: number) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("trash.title")}</h1>
        <AppRouteLink href="/app">{t("common.back")}</AppRouteLink>
      </header>
      <section className={styles.content} aria-label={t("trash.title")}>
        <Input.Search
          className={styles.search}
          allowClear
          value={query}
          aria-label={t("dashboard.searchResume")}
          placeholder={t("dashboard.searchResumePlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          onSearch={(value) => {
            activeQuery.current = value;
            void load(1);
          }}
        />
        {loadFailed ? (
          <Result
            status="error"
            title={t("trash.loadError")}
            extra={
              <Button onClick={() => void load(page?.page ?? 1)}>
                {t("trash.retry")}
              </Button>
            }
          />
        ) : null}
        {page || loading ? (
          <Table<ResumeTrashEntry>
            rowKey="id"
            dataSource={page?.items ?? []}
            loading={loading}
            pagination={false}
            scroll={{ x: 680 }}
            locale={{ emptyText: <Empty description={t("trash.empty")} /> }}
            columns={[
              {
                title: t("dashboard.columnTitle"),
                dataIndex: "title",
                key: "title",
              },
              {
                title: t("trash.deletedAt"),
                key: "deletedAt",
                render: (_, entry) => date(entry.deletedAt),
              },
              {
                title: t("trash.purgeAfter"),
                key: "purgeAfter",
                render: (_, entry) =>
                  entry.recoverable ? (
                    date(entry.purgeAfter)
                  ) : (
                    <Tag>{t("trash.expired")}</Tag>
                  ),
              },
              {
                title: t("dashboard.columnActions"),
                key: "actions",
                align: "right",
                render: (_, entry) => (
                  <div className={styles.actions}>
                    <Button
                      disabled={!entry.recoverable || Boolean(pending)}
                      onClick={() => void perform(entry, "restore")}
                    >
                      {t("trash.restore")}
                    </Button>
                    <Button
                      danger
                      disabled={Boolean(pending)}
                      onClick={() => setSelected(entry)}
                    >
                      {t("trash.purge")}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        ) : null}
        {page && page.totalPages > 1 ? (
          <div className={styles.footer}>
            <Pagination
              current={page.page}
              pageSize={page.pageSize}
              total={page.total}
              showSizeChanger={false}
              disabled={loading || Boolean(pending)}
              onChange={(number) => void load(number)}
            />
          </div>
        ) : null}
      </section>
      <ActionConfirmationModal
        open={Boolean(selected)}
        title={t("trash.purgeTitle", { title: selected?.title ?? "" })}
        description={t("trash.purgeDescription")}
        confirmText={t("trash.purge")}
        cancelText={t("common.cancel")}
        pending={Boolean(pending)}
        onCancel={() => {
          if (!pending) setSelected(undefined);
        }}
        onConfirm={() => {
          if (selected) void perform(selected, "purge");
        }}
      />
    </>
  );
}
