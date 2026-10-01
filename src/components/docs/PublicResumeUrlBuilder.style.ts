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
    colorPrefix: css`
      display: inline-flex;
      width: 42px;
      align-items: center;
      justify-content: center;
      border: 1px solid ${token.colorBorder};
      border-right: 0;
      border-radius: ${token.borderRadius}px 0 0 ${token.borderRadius}px;
      background: ${token.colorFillTertiary};
      color: ${token.colorTextSecondary};
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
