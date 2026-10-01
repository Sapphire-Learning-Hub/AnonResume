"use client";

import { createStyles } from "antd-style";

export const usePublicAppearanceReferenceStyles = createStyles(
  ({ token, css }) => ({
    root: css`
      margin: 40px 0;
    `,
    details: css`
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadiusLG}px;
      background: ${token.colorBgContainer};

      &[open] > summary {
        border-bottom: 1px solid ${token.colorBorderSecondary};
      }
    `,
    summary: css`
      padding: 18px 20px;
      cursor: pointer;

      > span {
        color: ${token.colorText};
        font-size: 16px;
        font-weight: 650;
      }
    `,
    body: css`
      padding: 20px;
    `,
    tableViewport: css`
      overflow-x: auto;
    `,
    table: css`
      width: 100%;
      min-width: 760px;
      border: 1px solid ${token.colorBorderSecondary};
      border-spacing: 0;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 13px;

      th,
      td {
        padding: 10px 12px;
        border-right: 1px solid ${token.colorBorderSecondary};
        border-bottom: 1px solid ${token.colorBorderSecondary};
        text-align: left;
        vertical-align: top;
      }

      tr > :last-child {
        border-right: 0;
      }

      tbody tr:last-child td {
        border-bottom: 0;
      }

      th {
        background: ${token.colorFillQuaternary};
        color: ${token.colorTextSecondary};
        font-size: 12px;
        font-weight: 650;
      }

      th:first-child,
      td:first-child,
      th:last-child,
      td:last-child {
        white-space: nowrap;
      }

      code {
        padding: 0.16em 0.4em;
        border-radius: 4px;
        background: ${token.colorFillTertiary};
        color: ${token.colorText};
        font-size: 0.9em;
      }
    `,
    parameterColumn: css`
      width: 18%;
    `,
    detailsColumn: css`
      width: 70%;
    `,
    defaultColumn: css`
      width: 12%;
    `,
    purpose: css`
      margin: 0 0 8px;
      white-space: nowrap;
    `,
    valueList: css`
      display: flex;
      flex-wrap: wrap;
      gap: 7px 18px;
      margin: 0;
      padding: 0;
      list-style: none;

      > li {
        white-space: nowrap;
      }
    `,
    valueText: css`
      white-space: nowrap;
    `,
  }),
);
