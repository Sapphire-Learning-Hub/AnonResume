"use client";

import { Pagination, Select } from "antd";
import { createStyles } from "antd-style";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
  ADMIN_PERMISSION_KEYS,
  type AdminPermission,
} from "@/lib/admin-permissions";

export interface AdminSelectOption {
  id: string;
  label: string;
  permissions?: AdminPermission[];
}

interface AdminPagedSelectCommonProps {
  allowClear?: boolean;
  className?: string;
  endpoint: string;
  initialOptions?: AdminSelectOption[];
  onOptionsChange?: (options: AdminSelectOption[]) => void;
  placeholder: string;
  style?: CSSProperties;
}

type AdminPagedSelectProps = AdminPagedSelectCommonProps & (
  | {
      mode: "multiple";
      onChange: (value: string[]) => void;
      value?: string[];
    }
  | {
      mode?: undefined;
      onChange: (value: string | undefined) => void;
      value?: string;
    }
);

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
        typeof (item as AdminSelectOption).label === "string" &&
        ((item as AdminSelectOption).permissions === undefined ||
          (Array.isArray((item as AdminSelectOption).permissions) &&
            (item as AdminSelectOption).permissions!.every((permission) =>
              ADMIN_PERMISSION_KEYS.includes(permission),
            ))),
    ) &&
    typeof page.page === "number" &&
    typeof page.pageSize === "number" &&
    typeof page.total === "number" &&
    typeof page.totalPages === "number"
  );
}

export function AdminPagedSelect(props: AdminPagedSelectProps) {
  const { styles } = useStyles();
  const [page, setPage] = useState(emptyPage);
  const [knownOptions, setKnownOptions] = useState(props.initialOptions ?? []);
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
      const response = await fetch(`${props.endpoint}?${params.toString()}`);
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (currentRequestId === requestId.current && isAdminSelectPage(payload)) {
        setPage(payload);
        props.onOptionsChange?.(payload.items);
        setKnownOptions((current) => {
          const options = new Map(current.map((item) => [item.id, item]));
          for (const item of payload.items) options.set(item.id, item);
          return [...options.values()];
        });
      }
    } catch {
      if (currentRequestId === requestId.current) setPage(emptyPage);
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }

  return (
    <Select
      allowClear={props.allowClear}
      aria-label={props.placeholder}
      className={props.className}
      filterOption={false}
      loading={loading}
      mode={props.mode}
      onChange={(nextValue) => {
        if (props.mode === "multiple") {
          props.onChange(nextValue as string[]);
        } else {
          props.onChange(nextValue as string | undefined);
        }
      }}
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
      options={knownOptions.map((item) => ({
        label: item.label,
        value: item.id,
      }))}
      placeholder={props.placeholder}
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
      style={props.style}
      value={props.value}
    />
  );
}
