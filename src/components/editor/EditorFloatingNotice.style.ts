"use client";

import { createStyles } from "antd-style";

export const useEditorFloatingNoticeStyles = createStyles(
  ({ token, css }) => ({
    stack: css`
      position: fixed;
      top: 76px;
      left: 50%;
      z-index: 40;
      display: grid;
      width: min(720px, calc(100vw - 32px));
      gap: 8px;
      transform: translateX(-50%);
      pointer-events: none;

      @media (max-width: 760px) {
        top: 70px;
      }
    `,
    notice: css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 14px;
      border: 1px solid color-mix(in srgb, ${token.colorWarning} 34%, transparent);
      border-radius: 14px;
      background: color-mix(in srgb, ${token.colorBgElevated} 96%, ${token.colorWarningBg});
      box-shadow: ${token.boxShadowSecondary};
      backdrop-filter: blur(18px);
      pointer-events: auto;

      @media (max-width: 760px) {
        align-items: flex-start;
        flex-direction: column;
      }
    `,
    message: css`
      display: grid;
      min-width: 0;
      grid-template-columns: 28px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
    `,
    icon: css`
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      border-radius: 9px;
      color: ${token.colorWarningText};
      background: ${token.colorWarningBg};
      font-size: 16px;
    `,
    text: css`
      display: grid;
      min-width: 0;
      gap: 2px;
    `,
    title: css`
      overflow: hidden;
      color: ${token.colorText};
      font-size: 13px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    description: css`
      overflow: hidden;
      color: ${token.colorTextSecondary};
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    actions: css`
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 6px;

      @media (max-width: 760px) {
        width: 100%;
        justify-content: flex-end;
      }
    `,
  }),
);
