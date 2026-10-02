"use client";

import { createStyles } from "antd-style";

export const useSectionPresetCommandsStyles = createStyles(
  ({ token, css }) => ({
    grid: css`
      display: grid;
      grid-auto-columns: 190px;
      grid-auto-flow: column;
      grid-template-rows: repeat(2, 30px);
      gap: 3px 5px;
      min-width: max-content;
    `,
    card: css`
      position: relative;
      display: flex;
      align-items: center;
      min-width: 0;
      height: 30px;
      padding: 0 8px;
      overflow: hidden;
      border: 1px solid transparent;
      border-radius: ${token.borderRadius}px;
      background: transparent;
      color: ${token.colorText};

      &:hover,
      &:focus-within {
        border-color: ${token.colorBorder};
        background: ${token.colorFillTertiary};
      }

      &:hover > [data-section-preset-actions],
      &:focus-within > [data-section-preset-actions] {
        opacity: 1;
        pointer-events: auto;
      }
    `,
    label: css`
      min-width: 0;
      overflow: hidden;
      font-size: ${token.fontSizeSM}px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    actions: css`
      position: absolute;
      inset: 0 3px 0 auto;
      display: flex;
      align-items: center;
      gap: 2px;
      padding-left: 18px;
      opacity: 0;
      pointer-events: none;
      background: linear-gradient(
        90deg,
        transparent 0,
        ${token.colorFillTertiary} 18px
      );
      transition: opacity ${token.motionDurationFast};
    `,
    actionButton: css`
      &&& {
        height: 24px;
        padding: 0 6px;
        border-color: transparent;
        background: ${token.colorBgContainer};
        color: ${token.colorText};
        font-size: ${token.fontSizeSM}px;
        box-shadow: none;

        &:hover:not(:disabled) {
          border-color: ${token.colorPrimaryBorder};
          background: ${token.colorPrimaryBg};
          color: ${token.colorPrimaryText};
        }

        &:focus-visible {
          outline: 2px solid ${token.colorPrimary};
          outline-offset: 1px;
        }
      }
    `,
    previewIntro: css`
      margin: 0 0 ${token.marginSM}px;
      color: ${token.colorTextSecondary};
      line-height: ${token.lineHeight};
    `,
    previewViewport: css`
      display: flex;
      justify-content: center;
      height: min(52vh, 520px);
      overflow: auto;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadiusLG}px;
      background: ${token.colorBgLayout};
    `,
    previewPage: css`
      flex: 0 0 auto;
      transform-origin: top left;
    `,
  }),
);
