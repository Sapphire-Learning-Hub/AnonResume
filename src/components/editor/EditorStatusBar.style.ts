"use client";

import { createStyles } from "antd-style";

export const useEditorStatusBarStyles = createStyles(({ css, token }) => ({
  statusBar: css`
    position: relative;
    z-index: 20;
    display: grid;
    grid-template-columns: minmax(120px, 1fr) auto minmax(120px, 1fr);
    align-items: center;
    flex: 0 0 32px;
    min-width: 0;
    height: 32px;
    padding: 0 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    background: #525b69;
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
  `,
  pageCount: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  navigation: css`
    display: flex;
    justify-content: center;
    min-width: 0;
  `,
  zoomControls: css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
    gap: 2px;
  `,
  zoomButton: css`
    && {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      min-width: 26px;
      height: 26px;
      padding: 0;
      border: 0;
      border-radius: ${token.borderRadiusSM}px;
      color: rgba(255, 255, 255, 0.86);
      background: transparent;

      &:hover,
      &:focus-visible {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.14);
      }

      &:disabled {
        color: rgba(255, 255, 255, 0.34);
        background: transparent;
      }
    }
  `,
  zoomValue: css`
    min-width: 44px;
    color: rgba(255, 255, 255, 0.9);
    font-variant-numeric: tabular-nums;
    text-align: center;
  `,
}));
