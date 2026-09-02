"use client";

import { createStyles } from "antd-style";

export const useResumeVersionDiffPromptStyles = createStyles(
  ({ token, css }) => ({
    modal: css`
      && {
        max-width: calc(100vw - 28px);
        padding-bottom: 0;

        .ant-modal-content {
          display: grid;
          overflow: hidden;
          max-height: calc(100dvh - 28px);
          grid-template-rows: auto minmax(0, 1fr) auto;
          padding: 0;
        }

        .ant-modal-header {
          margin: 0;
          padding: 17px 22px;
          border-bottom: 1px solid ${token.colorBorderSecondary};
        }

        .ant-modal-body {
          min-height: 0;
          padding: 0;
        }

        .ant-modal-footer {
          margin: 0;
          padding: 12px 22px;
          border-top: 1px solid ${token.colorBorderSecondary};
          background: ${token.colorBgElevated};
        }
      }
    `,
    modalContent: css`
      min-height: min(74dvh, 820px);
      height: min(78dvh, 900px);
      background: ${token.colorBgLayout};

      > * {
        height: 100%;
      }
    `,
    stateMessage: css`
      display: grid;
      min-height: 320px;
      place-items: center;
      color: ${token.colorTextSecondary};
      background: ${token.colorBgContainer};
      text-align: center;
    `,
  }),
);
