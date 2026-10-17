"use client";

import { createStyles } from "antd-style";

export const useEditorWorkspaceSidebarStyles = createStyles(
  ({ css, token }) => ({
    rail: css`
      display: flex;
      min-width: 0;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
      border-right: 1px solid ${token.colorBorderSecondary};
      background: ${token.colorBgContainer};
    `,
    navigation: css`
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 8px 6px;
    `,
    navigationButton: css`
      && {
        display: flex;
        width: 40px;
        min-width: 40px;
        height: 40px;
        align-items: center;
        justify-content: center;
        padding: 0;
        border-color: transparent;
        border-radius: 8px;
        color: ${token.colorTextSecondary};
        font-size: 18px;
        box-shadow: none;
      }

      &&[aria-pressed="true"] {
        border-color: ${token.colorPrimaryBorder};
        background: ${token.colorPrimaryBg};
        color: ${token.colorPrimaryText};
      }

      &&:hover:not(:disabled) {
        border-color: transparent;
        background: ${token.colorFillTertiary};
        color: ${token.colorText};
      }
    `,
    outlinePanel: css`
      position: relative;
      display: flex;
      min-width: 0;
      min-height: 0;
      flex: 1 1 auto;
      flex-direction: column;
      overflow: auto;
      padding: 10px 12px 18px;
      border-right: 1px solid ${token.colorBorderSecondary};
      background: color-mix(in srgb, ${token.colorBgContainer} 88%, transparent);
    `,
    helpAction: css`
      display: flex;
      justify-content: center;
      margin-top: auto;
      padding: 6px 6px 8px;
      border-top: 1px solid ${token.colorBorderSecondary};
    `,
  }),
);
