import type { ReactNode } from "react";

import { NumberedPagination } from "@/components/common/NumberedPagination";
import type { PaginationSearchParams } from "@/lib/pagination";

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
        {actions}
      </header>
      {children}
    </section>
  );
}

export function AdminTable({
  headers,
  pagination,
  rows,
}: {
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
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination ? <NumberedPagination {...pagination} /> : null}
    </>
  );
}
