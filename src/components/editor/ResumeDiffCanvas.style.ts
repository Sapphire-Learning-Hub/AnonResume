"use client";

import { createStyles } from "antd-style";

export const useResumeDiffCanvasStyles = createStyles(({ token, css }) => ({
  root: css`
    display: grid;
    min-height: 0;
    grid-template-rows: auto auto minmax(0, 1fr);
    background: ${token.colorBgLayout};
  `,
  toolbar: css`
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
  `,
  summary: css`
    display: inline-flex;
    min-width: 0;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
  `,
  summaryLead: css`
    margin-right: 4px;
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 700;
  `,
  summaryKind: css`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;

    &[data-diff-kind="added"] {
      border-color: ${token.colorSuccessBorder};
      color: ${token.colorSuccessText};
      background: ${token.colorSuccessBg};
    }

    &[data-diff-kind="removed"] {
      border-color: ${token.colorErrorBorder};
      color: ${token.colorErrorText};
      background: ${token.colorErrorBg};
    }

    &[data-diff-kind="changed"] {
      border-color: ${token.colorWarningBorder};
      color: ${token.colorWarningText};
      background: ${token.colorWarningBg};
    }

    &[data-diff-kind="moved"] {
      border-color: ${token.colorInfoBorder};
      color: ${token.colorInfoText};
      background: ${token.colorInfoBg};
    }
  `,
  navigation: css`
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
  `,
  navigationStatus: css`
    min-width: 76px;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  `,
  settingStrip: css`
    display: flex;
    overflow-x: auto;
    align-items: center;
    gap: 8px;
    padding: 9px 18px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
    scrollbar-width: thin;
  `,
  settingLabel: css`
    flex: none;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    font-weight: 700;
  `,
  settingChip: css`
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 7px;
    padding: 5px 9px;
    border: 1px solid ${token.colorWarningBorder};
    border-radius: 999px;
    color: ${token.colorTextSecondary};
    background: ${token.colorWarningBg};
    font-size: 11px;

    strong {
      color: ${token.colorText};
    }
  `,
  settingArrow: css`
    color: ${token.colorTextQuaternary};
  `,
  panes: css`
    display: grid;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  `,
  pane: css`
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);

    & + & {
      border-left: 1px solid ${token.colorBorderSecondary};
    }
  `,
  paneHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 42px;
    padding: 8px 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};

    strong {
      color: ${token.colorText};
      font-size: 13px;
    }

    span {
      color: ${token.colorTextTertiary};
      font-size: 11px;
    }
  `,
  viewport: css`
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 24px 20px 36px;
    background:
      radial-gradient(circle at 50% 0, rgba(255, 255, 255, 0.09), transparent 34%),
      #68707d;
    scrollbar-gutter: stable;
  `,
  scaleShell: css`
    position: relative;
    margin: 0 auto;
  `,
  scaleContent: css`
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
  `,
}));
