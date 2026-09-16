"use client";

import { createStyles } from "antd-style";

export const useAiAssistantPanelStyles = createStyles(({ token, css }) => ({
  body: css`
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
    min-height: 0;
  `,
  toolbar: css`
    display: grid;
    gap: 10px;
    padding: 0 0 14px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  toolbarRow: css`
    display: flex;
    align-items: center;
    gap: 8px;

    .ant-select {
      flex: 1;
      min-width: 0;
    }
  `,
  setup: css`
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorFillQuaternary};
  `,
  messages: css`
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: 12px;
    overflow: auto;
    padding: 16px 2px;
  `,
  empty: css`
    display: grid;
    flex: 1;
    place-items: center;
    min-height: 240px;
    color: ${token.colorTextSecondary};
    text-align: center;
  `,
  message: css`
    display: grid;
    gap: 5px;
    max-width: 92%;
    padding: 10px 12px;
    border-radius: 12px;
    line-height: 1.65;
    white-space: pre-wrap;
    overflow-wrap: anywhere;

    &[data-role="user"] {
      align-self: flex-end;
      background: ${token.colorPrimaryBg};
      border: 1px solid ${token.colorPrimaryBorder};
    }

    &[data-role="assistant"] {
      align-self: flex-start;
      background: ${token.colorFillQuaternary};
      border: 1px solid ${token.colorBorderSecondary};
    }
  `,
  messageRole: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  proposal: css`
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid ${token.colorPrimaryBorder};
    border-radius: ${token.borderRadiusLG}px;
    background: color-mix(in srgb, ${token.colorPrimaryBg} 55%, ${token.colorBgContainer});
  `,
  proposalHeader: css`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  `,
  proposalTitle: css`
    display: grid;
    gap: 3px;

    strong {
      color: ${token.colorText};
    }

    span {
      color: ${token.colorTextSecondary};
      font-size: 12px;
    }
  `,
  changes: css`
    display: grid;
    gap: 8px;
  `,
  change: css`
    display: grid;
    gap: 6px;
    padding: 10px;
    border-radius: ${token.borderRadius}px;
    background: ${token.colorBgContainer};
  `,
  changeText: css`
    display: grid;
    gap: 3px;
    min-width: 0;

    small {
      color: ${token.colorTextSecondary};
    }

    span {
      overflow-wrap: anywhere;
    }
  `,
  composer: css`
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  composerActions: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  `,
  hint: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1.5;
  `,
}));
