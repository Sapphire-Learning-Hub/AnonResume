"use client";

import { createStyles } from "antd-style";

export const useAiReviewStyles = createStyles(({ token, css }) => ({
  body: css`flex: 1; min-height: 0; overflow: auto; padding: 18px;`,
  stack: css`display: flex; flex-direction: column; gap: 16px; min-width: 0;`,
  actions: css`display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 8px;`,
  filters: css`display: flex; flex-wrap: wrap; gap: 8px; align-items: center;`,
  filter: css`&& { flex: 1; min-width: 140px; }`,
  field: css`display: flex; flex-direction: column; gap: 6px; min-width: 0;`,
  title: css`margin: 0; color: ${token.colorText}; font-size: ${token.fontSizeLG}px; font-weight: 600;`,
  muted: css`color: ${token.colorTextSecondary}; font-size: ${token.fontSizeSM}px; margin: 0;`,
  score: css`display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px; background: ${token.colorFillAlter}; border-radius: ${token.borderRadiusLG}px;`,
  number: css`font-size: 32px; font-weight: 700; color: ${token.colorPrimary};`,
  card: css`padding: 14px; border: 1px solid ${token.colorBorderSecondary}; border-radius: ${token.borderRadiusLG}px; display: flex; flex-direction: column; gap: 10px; min-width: 0; &[data-ignored="true"] { opacity: 0.65; }`,
  quote: css`margin: 0; padding: 8px 12px; border-inline-start: 3px solid ${token.colorBorder}; color: ${token.colorTextSecondary}; background: ${token.colorFillAlter}; white-space: pre-wrap; overflow-wrap: anywhere;`,
  paragraph: css`margin: 0; white-space: pre-wrap; overflow-wrap: anywhere;`,
  warning: css`padding: 12px; background: ${token.colorWarningBg}; color: ${token.colorWarningText}; border: 1px solid ${token.colorWarningBorder}; border-radius: ${token.borderRadius}px;`,
  historySelect: css`&& { width: 100%; min-width: 0; }`,
}));
