"use client";

import { useDeferredValue, useEffect, useState } from "react";

import { Button, Empty, Input, Modal, Segmented, Spin, Tooltip } from "antd";
import { createStyles } from "antd-style";

import { ResumeInlineIcon } from "@/components/resume/ResumeInlineIcon";
import {
  filterResumeIcons,
  type ResumeIconCategory,
} from "@/domain/resume/icon-catalog";
import { useI18n } from "@/i18n/I18nProvider";

const useResumeIconPickerStyles = createStyles(({ token, css }) => ({
  modalBody: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: min(620px, calc(100vh - 190px));
    min-height: 420px;
    padding-top: 8px;
    overflow: hidden;
  `,
  search: css`
    && {
      flex: 0 0 auto;
    }
  `,
  categories: css`
    && {
      flex: 0 0 auto;
      width: 100%;

      .ant-segmented-group {
        width: 100%;
      }

      .ant-segmented-item {
        flex: 1;
        min-width: 0;
      }
    }
  `,
  resultsMeta: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 auto;
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  grid: css`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    grid-auto-rows: max-content;
    gap: 10px;
    min-height: 0;
    padding: 2px 6px 16px 2px;
    overflow-y: auto;
    overscroll-behavior: contain;
  `,
  loadMore: css`
    display: grid;
    width: 100%;
    height: 36px;
    grid-column: 1 / -1;
    place-items: center;
    pointer-events: none;
  `,
  iconButton: css`
    && {
      display: flex;
      width: 100%;
      height: 82px;
      padding: 10px 8px;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 14px;
    }
  `,
  iconPreview: css`
    color: ${token.colorText};
    font-size: 24px;
  `,
  iconLabel: css`
    display: block;
    width: 100%;
    overflow: hidden;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  empty: css`
    display: grid;
    min-height: 280px;
    place-items: center;
  `,
}));

const categories: Array<ResumeIconCategory | "all"> = [
  "all",
  "common",
  "contact",
  "social",
  "work",
  "education",
  "development",
  "other",
];

const ICON_BATCH_SIZE = 72;

function getCategoryMessageKey(category: ResumeIconCategory | "all") {
  return `editor.iconLibrary.category.${category}` as const;
}

export function ResumeIconPicker({
  onCancel,
  onSelect,
  open,
}: {
  onCancel: () => void;
  onSelect: (iconId: string) => void;
  open: boolean;
}) {
  const { styles } = useResumeIconPickerStyles();
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ResumeIconCategory | "all">("all");
  const [visibleCount, setVisibleCount] = useState(ICON_BATCH_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const [loadMoreElement, setLoadMoreElement] =
    useState<HTMLDivElement | null>(null);
  const deferredQuery = useDeferredValue(query);
  const icons = filterResumeIcons(deferredQuery, category);
  const visibleIcons = icons.slice(0, visibleCount);

  useEffect(() => {
    if (!open || visibleCount >= icons.length) return;

    if (!gridElement || !loadMoreElement) return;

    if (typeof IntersectionObserver === "undefined") {
      const fallbackTimer = window.setTimeout(() => {
        setVisibleCount(icons.length);
      }, 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    let scheduledFrame: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (scheduledFrame !== undefined) return;
        observer.unobserve(loadMoreElement);
        setLoadingMore(true);
        scheduledFrame = window.requestAnimationFrame(() => {
          scheduledFrame = undefined;
          setVisibleCount((current) =>
            Math.min(current + ICON_BATCH_SIZE, icons.length),
          );
          setLoadingMore(false);
        });
      },
      {
        root: gridElement,
        rootMargin: "180px 0px",
      },
    );

    observer.observe(loadMoreElement);
    return () => {
      observer.disconnect();
      if (scheduledFrame !== undefined) {
        window.cancelAnimationFrame(scheduledFrame);
      }
    };
  }, [category, gridElement, icons.length, loadMoreElement, open, query, visibleCount]);

  return (
    <Modal
      afterOpenChange={(visible) => {
        if (!visible) {
          setQuery("");
          setCategory("all");
          setVisibleCount(ICON_BATCH_SIZE);
          setLoadingMore(false);
        }
      }}
      centered
      classNames={{ body: styles.modalBody }}
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
      open={open}
      title={t("editor.iconLibrary.title")}
      width={940}
    >
      <Input.Search
        allowClear
        aria-label={t("editor.iconLibrary.search")}
        autoFocus
        className={styles.search}
        placeholder={t("editor.iconLibrary.searchPlaceholder")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setVisibleCount(ICON_BATCH_SIZE);
          setLoadingMore(false);
        }}
      />
      <Segmented
        aria-label={t("editor.iconLibrary.categories")}
        block
        className={styles.categories}
        options={categories.map((value) => ({
          label: t(getCategoryMessageKey(value)),
          value,
        }))}
        value={category}
        onChange={(value) => {
          setCategory(value as ResumeIconCategory | "all");
          setVisibleCount(ICON_BATCH_SIZE);
          setLoadingMore(false);
        }}
      />
      <div className={styles.resultsMeta}>
        <span>{t("editor.iconLibrary.resultCount", { count: icons.length })}</span>
        <span>{t("editor.iconLibrary.localOnly")}</span>
      </div>
      {icons.length ? (
        <div
          className={styles.grid}
          data-testid="resume-icon-grid"
          ref={setGridElement}
        >
          {visibleIcons.map((icon) => {
            const label = locale === "zh-CN" ? icon.labelZh : icon.labelEn;
            const actionLabel = t("editor.iconLibrary.insertNamed", { name: label });

            return (
              <Tooltip key={icon.id} title={`${label} · ${icon.source}`}>
                <Button
                  aria-label={actionLabel}
                  className={styles.iconButton}
                  onClick={() => onSelect(icon.id)}
                >
                  <span className={styles.iconPreview}>
                    <ResumeInlineIcon iconId={icon.id} />
                  </span>
                  <span className={styles.iconLabel}>{label}</span>
                </Button>
              </Tooltip>
            );
          })}
          {visibleCount < icons.length ? (
            <div
              aria-hidden={loadingMore ? undefined : true}
              aria-label={
                loadingMore ? t("editor.iconLibrary.loadingMore") : undefined
              }
              className={styles.loadMore}
              data-loading={loadingMore}
              data-testid="resume-icon-load-more"
              ref={setLoadMoreElement}
              role={loadingMore ? "status" : undefined}
            >
              {loadingMore ? <Spin size="small" /> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className={styles.empty}>
          <Empty description={t("editor.iconLibrary.empty")} />
        </div>
      )}
    </Modal>
  );
}
