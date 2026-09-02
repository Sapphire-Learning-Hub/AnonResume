"use client";

import { Button, Pagination } from "antd";
import { createStyles } from "antd-style";
import {
  cloneElement,
  isValidElement,
  useRef,
  type ReactElement,
} from "react";

import { useI18n } from "@/i18n/I18nProvider";

const useStyles = createStyles(({ css, token }) => ({
  navigation: css`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;

    && :global(.ant-pagination) {
      color: rgba(255, 255, 255, 0.82);
    }

    && :global(.ant-pagination-simple-pager) {
      color: rgba(255, 255, 255, 0.72);
    }

    && :global(.ant-pagination-slash) {
      color: rgba(255, 255, 255, 0.72);
    }

    && :global(.ant-pagination-prev .ant-pagination-item-link),
    && :global(.ant-pagination-next .ant-pagination-item-link) {
      color: rgba(255, 255, 255, 0.82);
      border-color: rgba(255, 255, 255, 0.24);
      background: rgba(15, 23, 42, 0.18);
    }

    && :global(.ant-pagination-disabled .ant-pagination-item-link) {
      color: rgba(255, 255, 255, 0.34);
    }
  `,
  jumpButton: css`
    && {
      color: rgba(255, 255, 255, 0.9);
      border-color: rgba(255, 255, 255, 0.28);
      background: rgba(15, 23, 42, 0.28);

      &:hover,
      &:focus-visible {
        color: #ffffff;
        border-color: color-mix(in srgb, ${token.colorPrimary} 72%, white);
        background: color-mix(in srgb, ${token.colorPrimary} 34%, transparent);
      }
    }
  `,
}));

export function CanvasPageNavigation({
  current,
  onChange,
  pageCount,
}: {
  current: number;
  onChange: (page: number) => void;
  pageCount: number;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const navigationRef = useRef<HTMLDivElement>(null);

  function handleJump() {
    const value = navigationRef.current?.querySelector<HTMLInputElement>(
      ".ant-pagination-simple-pager input",
    )?.value;
    const parsedPage = Number(value);

    if (!Number.isInteger(parsedPage)) {
      return;
    }

    onChange(Math.min(pageCount, Math.max(1, parsedPage)));
  }

  return (
    <div
      ref={navigationRef}
      aria-label={t("editor.pageNavigation")}
      className={styles.navigation}
    >
      <Pagination
        current={current}
        itemRender={(_page, type, element) => {
          if (
            (type !== "prev" && type !== "next") ||
            !isValidElement(element)
          ) {
            return element;
          }

          return cloneElement(
            element as ReactElement<{ "aria-label"?: string }>,
            {
              "aria-label":
                type === "prev"
                  ? t("editor.previousPage")
                  : t("editor.nextPage"),
            },
          );
        }}
        locale={{
          jump_to: t("editor.pageJump"),
          next_page: t("editor.nextPage"),
          page: t("editor.pageUnit"),
          prev_page: t("editor.previousPage"),
        }}
        pageSize={1}
        simple
        size="small"
        showSizeChanger={false}
        total={pageCount}
        onChange={onChange}
      />
      <Button
        aria-label={t("editor.jumpToPage")}
        className={styles.jumpButton}
        size="small"
        onClick={handleJump}
      >
        {t("editor.jumpToPage")}
      </Button>
    </div>
  );
}
