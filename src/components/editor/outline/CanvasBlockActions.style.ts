"use client";
import { createStyles } from "antd-style";

export const useCanvasBlockActionsStyles = createStyles(({ css, token }) => ({
  toolbar: css`
    position: absolute;
    bottom: 12px;
    left: 12px;
    z-index: 12;
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: calc(100% - 24px);
    padding: 4px 6px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorBgElevated};
    box-shadow: ${token.boxShadowSecondary};
    color: ${token.colorText};
    font-size: 12px;
  `,
  path: css`
    display: flex;
    min-width: 0;
    align-items: center;
    overflow: hidden;
    gap: 2px;
  `,
  crumb: css`
    && {
      min-width: 0;
      max-width: 120px;
      height: 28px;
      padding: 0 5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }
  `,
  action: css`
    && {
      width: 28px;
      min-width: 28px;
      height: 28px;
      padding: 0;
    }
  `,
  count: css`
    white-space: nowrap;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    padding: 0 4px;
  `,
}));
