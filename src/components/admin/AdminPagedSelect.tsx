"use client";

import { Pagination, Select } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

interface AdminSelectOption {
  id: string;
  label: string;
}

interface AdminSelectPage {
  items: AdminSelectOption[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const emptyPage: AdminSelectPage = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
};

const useStyles = createStyles(({ css, token }) => ({
  footer: css`
    display: flex;
    justify-content: flex-end;
    padding: 10px 8px 4px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
}));

function isAdminSelectPage(value: unknown): value is AdminSelectPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<AdminSelectPage>;
  return (
    Array.isArray(page.items) &&
    page.items.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as AdminSelectOption).id === "string" &&
        typeof (item as AdminSelectOption).label === "string",
    ) &&
    typeof page.page === "number" &&
    typeof page.pageSize === "number" &&
    typeof page.total === "number" &&
    typeof page.totalPages === "number"
  );
}

export function AdminPagedSelect({
  allowClear,
  endpoint,
  onChange,
  placeholder,
  style,
  value,
}: {
  allowClear?: boolean;
  endpoint: string;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  style?: CSSProperties;
  value?: string;
}) {
  const { styles } = useStyles();
  const [page, setPage] = useState(emptyPage);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  async function loadPage(nextPage: number, nextQuery: string) {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: "10",
      });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (currentRequestId === requestId.current && isAdminSelectPage(payload)) {
        setPage(payload);
      }
    } catch {
      if (currentRequestId === requestId.current) setPage(emptyPage);
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }

  return (
    <Select
      allowClear={allowClear}
      aria-label={placeholder}
      filterOption={false}
      loading={loading}
      onChange={onChange}
      onOpenChange={(open) => {
        if (open) void loadPage(1, query);
      }}
      onSearch={(nextQuery) => {
        setQuery(nextQuery);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
          void loadPage(1, nextQuery);
        }, 250);
      }}
      options={page.items.map((item) => ({
        label: item.label,
        value: item.id,
      }))}
      placeholder={placeholder}
      popupRender={(menu) => (
        <>
          {menu}
          {page.totalPages > 1 ? (
            <div
              className={styles.footer}
              onMouseDown={(event) => event.preventDefault()}
            >
              <Pagination
                current={page.page}
                onChange={(nextPage) => void loadPage(nextPage, query)}
                pageSize={page.pageSize}
                showSizeChanger={false}
                size="small"
                total={page.total}
              />
            </div>
          ) : null}
        </>
      )}
      showSearch
      style={style}
      value={value}
    />
  );
}
