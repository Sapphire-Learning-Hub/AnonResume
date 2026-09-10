"use client";

import Link from "next/link";
import { createStyles } from "antd-style";

import { useI18n } from "@/i18n/I18nProvider";
import type { PaginationSearchParams } from "@/lib/shared/pagination";

const useStyles = createStyles(({ css, token }) => ({
  root: css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 16px;
  `,
  summary: css`
    margin-right: 4px;
    color: ${token.colorTextSecondary};
    font-size: 13px;
  `,
  control: css`
    display: inline-grid;
    min-width: 32px;
    height: 32px;
    place-items: center;
    padding: 0 10px;
    border: 1px solid ${token.colorBorder};
    border-radius: ${token.borderRadius}px;
    color: ${token.colorText};
    line-height: 1;
    text-decoration: none;

    &:hover {
      border-color: ${token.colorPrimary};
      color: ${token.colorPrimary};
    }

    &[aria-current="page"] {
      border-color: ${token.colorPrimary};
      background: ${token.colorPrimary};
      color: ${token.colorTextLightSolid};
    }

    &[data-disabled="true"] {
      border-color: ${token.colorBorderSecondary};
      color: ${token.colorTextDisabled};
    }
  `,
  ellipsis: css`
    min-width: 24px;
    color: ${token.colorTextSecondary};
    text-align: center;
  `,
}));

function pageItems(page: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const values = [...pages]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((left, right) => left - right);
  const items: Array<number | "ellipsis"> = [];

  values.forEach((value, index) => {
    if (index > 0 && value - values[index - 1]! > 1) {
      items.push("ellipsis");
    }
    items.push(value);
  });

  return items;
}

function pageHref(
  basePath: string,
  searchParams: PaginationSearchParams,
  pageParam: string,
  page: number,
) {
  const params = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  });
  params.set(pageParam, String(page));

  return `${basePath}?${params.toString()}`;
}

export function NumberedPagination({
  basePath,
  page,
  pageParam = "page",
  searchParams,
  total,
  totalPages,
}: {
  basePath: string;
  page: number;
  pageParam?: string;
  pageSize: number;
  searchParams: PaginationSearchParams;
  total: number;
  totalPages: number;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();

  if (totalPages <= 1) return null;

  return (
    <nav aria-label={t("pagination.navigation")} className={styles.root}>
      <span className={styles.summary}>
        {t("pagination.total", { count: total })}
      </span>
      {page > 1 ? (
        <Link
          className={styles.control}
          href={pageHref(basePath, searchParams, pageParam, page - 1)}
        >
          {t("pagination.previous")}
        </Link>
      ) : (
        <span aria-disabled="true" className={styles.control} data-disabled="true">
          {t("pagination.previous")}
        </span>
      )}
      {pageItems(page, totalPages).map((item, index) =>
        item === "ellipsis" ? (
          <span className={styles.ellipsis} key={`ellipsis-${index}`}>
            ...
          </span>
        ) : (
          <Link
            aria-current={item === page ? "page" : undefined}
            aria-label={t("pagination.page", { page: item })}
            className={styles.control}
            href={pageHref(basePath, searchParams, pageParam, item)}
            key={item}
          >
            {item}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link
          className={styles.control}
          href={pageHref(basePath, searchParams, pageParam, page + 1)}
        >
          {t("pagination.next")}
        </Link>
      ) : (
        <span aria-disabled="true" className={styles.control} data-disabled="true">
          {t("pagination.next")}
        </span>
      )}
    </nav>
  );
}
