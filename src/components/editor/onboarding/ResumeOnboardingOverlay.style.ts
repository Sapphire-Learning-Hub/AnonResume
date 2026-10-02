"use client";

import { createStyles } from "antd-style";

export const useResumeOnboardingOverlayStyles = createStyles(
  ({ token, css }) => ({
    root: css`
      position: fixed;
      z-index: ${token.zIndexPopupBase - 1};
      inset: 0;
      pointer-events: none;
    `,
    shade: css`
      position: fixed;
      background: color-mix(in srgb, ${token.colorBgMask} 72%, transparent);
      pointer-events: none;
    `,
    highlight: css`
      position: fixed;
      border: 2px solid ${token.colorPrimary};
      border-radius: ${token.borderRadiusLG}px;
      box-shadow:
        0 0 0 4px color-mix(in srgb, ${token.colorPrimary} 18%, transparent),
        ${token.boxShadowSecondary};
      pointer-events: none;
    `,
    card: css`
      position: fixed;
      display: grid;
      width: min(360px, calc(100vw - 32px));
      gap: 14px;
      padding: 18px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadiusLG}px;
      background: ${token.colorBgElevated};
      box-shadow: ${token.boxShadowSecondary};
      color: ${token.colorText};
      pointer-events: auto;
    `,
    progress: css`
      color: ${token.colorTextTertiary};
      font-size: 12px;
      line-height: 1;
    `,
    title: css`
      margin: 0;
      color: ${token.colorText};
      font-size: 17px;
      font-weight: 700;
      line-height: 1.4;
    `,
    description: css`
      margin: 0;
      color: ${token.colorTextSecondary};
      font-size: 13px;
      line-height: 1.65;
    `,
    error: css`
      margin: 0;
      color: ${token.colorWarningText};
      font-size: 12px;
      line-height: 1.5;
    `,
    primaryActions: css`
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    `,
    secondaryActions: css`
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 8px;
      padding-top: 12px;
      border-top: 1px solid ${token.colorBorderSecondary};
    `,
  }),
);
