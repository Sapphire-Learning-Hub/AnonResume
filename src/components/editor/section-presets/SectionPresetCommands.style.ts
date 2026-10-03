"use client";

import { createStyles } from "antd-style";

export const useSectionPresetCommandsStyles = createStyles(
  ({ token, css }) => ({
    chooser: css`
      max-height: min(480px, calc(100vh - 160px));
      overflow: auto;
    `,
    chooserGrid: css`
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: ${token.marginSM}px;

      @media (max-width: 560px) {
        grid-template-columns: 1fr;
      }
    `,
    templateCard: css`
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 146px;
      overflow: hidden;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadiusLG}px;
      background: ${token.colorBgContainer};
      transition:
        border-color ${token.motionDurationFast},
        background ${token.motionDurationFast};

      &:hover,
      &:focus-within {
        border-color: ${token.colorPrimaryBorder};
        background: ${token.colorFillQuaternary};
      }

      &:hover > [data-template-actions],
      &:focus-within > [data-template-actions] {
        opacity: 1;
        pointer-events: auto;
      }
    `,
    templateSummary: css`
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: flex-start;
      padding: ${token.paddingMD}px ${token.paddingMD}px ${token.paddingXS}px;
    `,
    templateName: css`
      font-size: ${token.fontSizeLG}px;
      font-weight: 600;
      line-height: ${token.lineHeightHeading4};
    `,
    templateDescription: css`
      display: -webkit-box;
      margin-top: ${token.marginXS}px;
      overflow: hidden;
      color: ${token.colorTextSecondary};
      font-size: ${token.fontSizeSM}px;
      line-height: ${token.lineHeight};
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    `,
    templateActions: css`
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: nowrap;
      gap: ${token.marginXXS}px;
      min-height: 40px;
      padding: 0 ${token.paddingSM}px ${token.paddingSM}px;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${token.motionDurationFast};
    `,
    templateAction: css`
      &&& {
        color: ${token.colorTextSecondary};
        box-shadow: none;

        &:hover:not(:disabled) {
          background: ${token.colorFillSecondary};
          color: ${token.colorText};
        }

        &[data-action-primary] {
          color: ${token.colorPrimaryText};
          font-weight: 600;

          &:hover:not(:disabled) {
            background: ${token.colorPrimaryBg};
            color: ${token.colorPrimaryTextHover};
          }
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
      align-items: flex-start;
      justify-content: center;
      max-height: min(52vh, 520px);
      padding: ${token.paddingLG}px;
      overflow: auto;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadiusLG}px;
      background: ${token.colorBgLayout};
    `,
    previewScale: css`
      flex: 0 0 auto;
      zoom: 0.62;
    `,
  }),
);
