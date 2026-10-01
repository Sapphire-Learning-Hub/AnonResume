"use client";

import { createStyles } from "antd-style";

export const usePublicResumeUrlBuilderStyles = createStyles(
  ({ token, css }) => ({
    root: css`
      margin: 40px 0;
      padding: 24px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadiusLG}px;
      background: ${token.colorFillQuaternary};

      h2 {
        margin-top: 0;
      }
    `,
    resumeSelect: css`
      && {
        width: 100%;
      }
    `,
    resumeOption: css`
      display: grid;
      min-width: 0;
      gap: 2px;

      strong,
      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      span {
        color: ${token.colorTextSecondary};
        font-size: 13px;
      }
    `,
    controls: css`
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 16px;

      @media (max-width: 640px) {
        grid-template-columns: 1fr;
      }
    `,
    colorInput: css`
      && {
        text-transform: lowercase;
      }
    `,
    numberInput: css`
      && {
        width: 100%;
      }
    `,
    colorPickerButton: css`
      && {
        width: 42px;
        padding: 0;
      }
    `,
    colorSwatch: css`
      position: relative;
      display: inline-block;
      width: 18px;
      height: 18px;
      overflow: hidden;
      border: 1px solid ${token.colorBorder};
      border-radius: ${token.borderRadiusSM}px;

      &[data-empty="true"] {
        background-color: ${token.colorBgContainer};
        background-image:
          linear-gradient(
            45deg,
            ${token.colorFillSecondary} 25%,
            transparent 25%,
            transparent 75%,
            ${token.colorFillSecondary} 75%
          ),
          linear-gradient(
            45deg,
            ${token.colorFillSecondary} 25%,
            transparent 25%,
            transparent 75%,
            ${token.colorFillSecondary} 75%
          );
        background-position:
          0 0,
          4px 4px;
        background-size: 8px 8px;
      }

      &[data-empty="true"]::after {
        position: absolute;
        top: 8px;
        left: -2px;
        width: 22px;
        height: 1px;
        background: ${token.colorError};
        content: "";
        transform: rotate(-45deg);
      }
    `,
    output: css`
      display: grid;
      gap: 10px;
      margin-top: 8px;
      padding-top: 20px;
      border-top: 1px solid ${token.colorBorderSecondary};
    `,
    actions: css`
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    `,
    state: css`
      padding: 24px 0 8px;
      text-align: center;
    `,
  }),
);
