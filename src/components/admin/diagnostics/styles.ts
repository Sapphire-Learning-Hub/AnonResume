import { createStyles } from "antd-style";

export const useDiagnosticStyles = createStyles(({ css, token }) => ({
  filters: css`display: flex; flex-wrap: wrap; gap: ${token.marginSM}px; align-items: center;`,
  search: css`&& { width: 360px; max-width: 100%; }`,
  filter: css`&& { width: 160px; }`,
  pagination: css`display: flex; justify-content: flex-end; gap: ${token.marginSM}px; margin-top: ${token.margin}px;`,
  notes: css`display: grid; gap: ${token.marginSM}px; margin: ${token.margin}px 0;`,
  code: css`font-family: ${token.fontFamilyCode}; overflow-wrap: anywhere; white-space: pre-wrap; margin: 0;`,
  stage: css`display: grid; gap: ${token.marginXS}px;`,
  meta: css`color: ${token.colorTextSecondary}; font-size: ${token.fontSizeSM}px; overflow-wrap: anywhere;`,
}));
