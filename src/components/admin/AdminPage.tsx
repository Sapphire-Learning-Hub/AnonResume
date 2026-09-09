import type { ReactNode } from "react";

import { NumberedPagination } from "@/components/common/NumberedPagination";
import type { PaginationSearchParams } from "@/lib/pagination";

type AdminTone = "danger" | "default" | "info" | "success" | "warning";

export function AdminPage({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <h1>{title}</h1>
        {actions ? (
          <div className="admin-page-header__actions">{actions}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function AdminToolbar({
  children,
  meta,
}: {
  children: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="admin-toolbar">
      <div className="admin-toolbar__controls">{children}</div>
      {meta ? <div className="admin-toolbar__meta">{meta}</div> : null}
    </div>
  );
}

export function AdminSection({
  actions,
  children,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  title?: ReactNode;
}) {
  return (
    <section className="admin-section">
      {title || actions ? (
        <header className="admin-section__header">
          {title ? <h2>{title}</h2> : <span />}
          {actions ? (
            <div className="admin-section__actions">{actions}</div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function AdminMetricGrid({ children }: { children: ReactNode }) {
  return <div className="admin-metric-grid">{children}</div>;
}

export function AdminMetric({
  label,
  tone = "default",
  value,
}: {
  label: ReactNode;
  tone?: AdminTone;
  value: ReactNode;
}) {
  return (
    <article className="admin-metric" data-tone={tone}>
      <span className="admin-metric__label">{label}</span>
      <strong className="admin-metric__value">{value}</strong>
    </article>
  );
}

export function AdminIdentity({
  description,
  title,
}: {
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <span className="admin-identity">
      <strong className="admin-identity__title">{title}</strong>
      {description ? (
        <small className="admin-identity__description">{description}</small>
      ) : null}
    </span>
  );
}

export function AdminStatus({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: AdminTone;
}) {
  return (
    <span className="admin-status" data-tone={tone}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function AdminTableActions({ children }: { children: ReactNode }) {
  return <div className="admin-table-actions">{children}</div>;
}

export function AdminTable({
  actionColumn = false,
  headers,
  pagination,
  rows,
}: {
  actionColumn?: boolean;
  headers: string[];
  pagination?: {
    basePath: string;
    page: number;
    pageParam?: string;
    pageSize: number;
    searchParams: PaginationSearchParams;
    total: number;
    totalPages: number;
  };
  rows: ReactNode[][];
}) {
  return (
    <>
      <div className="admin-table-shell">
        <table className="admin-table">
          <thead>
            <tr>
              {headers.map((header, headerIndex) => (
                <th
                  className={
                    actionColumn && headerIndex === headers.length - 1
                      ? "admin-table__actions"
                      : undefined
                  }
                  key={header}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    className={
                      actionColumn && cellIndex === headers.length - 1
                        ? "admin-table__actions"
                        : undefined
                    }
                    data-label={headers[cellIndex]}
                    key={cellIndex}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination ? <NumberedPagination {...pagination} /> : null}
    </>
  );
}
