"use client";

import { createStyles } from "antd-style";

export const useEditorShortcutPanelStyles = createStyles(({ token, css }) => ({
  groupGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;

    @media (max-width: 640px) {
      grid-template-columns: 1fr;
    }
  `,
  group: css`
    min-width: 0;
    padding: 14px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorFillQuaternary};

    &:last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }

    @media (max-width: 640px) {
      &:last-child:nth-child(odd) {
        grid-column: auto;
      }
    }
  `,
  groupTitle: css`
    margin: 0 0 10px;
    color: ${token.colorText};
    font-size: 14px;
    font-weight: 700;
  `,
  shortcutList: css`
    display: grid;
    gap: 2px;
  `,
  shortcutRow: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 36px;
    gap: 14px;
    color: ${token.colorText};
    font-size: 13px;
  `,
  keySequences: css`
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
    text-align: right;
  `,
  keySequence: css`
    display: inline-flex;
    align-items: center;
    min-height: 25px;
    padding: 2px 8px;
    border: 1px solid ${token.colorBorder};
    border-bottom-width: 2px;
    border-radius: ${token.borderRadiusSM}px;
    background: ${token.colorBgContainer};
    color: ${token.colorTextSecondary};
    box-shadow: 0 1px 1px color-mix(in srgb, ${token.colorText} 5%, transparent);
    font-family: inherit;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
  `,
  orLabel: css`
    color: ${token.colorTextTertiary};
    font-size: 11px;
  `,
}));
