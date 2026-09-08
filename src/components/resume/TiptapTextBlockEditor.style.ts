"use client";

import { createStyles } from "antd-style";

export const useTiptapTextBlockEditorStyles = createStyles(({ token, css }) => ({
  inlineToolbar: css`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 10px;
    background: ${token.colorBgElevated};
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  `,
  inlineToolbarLinkForm: css`
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(320px, calc(100vw - 32px));
  `,
  inlineColorControl: css`
    box-sizing: border-box;
    display: flex;
    align-items: center;
    width: 28px;
    height: 28px;
    overflow: hidden;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    background: ${token.colorBgContainer};
  `,
}));
