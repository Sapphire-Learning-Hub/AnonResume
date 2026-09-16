"use client";

import { createStyles } from "antd-style";

export const useAiAssistantPanelStyles = createStyles(({ token, css }) => ({
  panel: css`
    position: relative;
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    height: 100dvh;
    min-width: 360px;
    max-width: min(720px, calc(100vw - 640px));
    overflow: hidden;
    border-inline-start: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
  `,
  resizeHandle: css`
    position: absolute;
    top: 0;
    bottom: 0;
    inset-inline-start: -5px;
    z-index: 3;
    width: 10px;
    touch-action: none;
    cursor: col-resize;

    &::after {
      position: absolute;
      top: 0;
      bottom: 0;
      inset-inline-start: 4px;
      width: 2px;
      background: ${token.colorBorderSecondary};
      content: "";
      transition: background 140ms ease;
    }

    &:hover::after,
    &:focus-visible::after {
      background: ${token.colorPrimary};
    }

    &:focus-visible {
      outline: none;
    }
  `,
  header: css`
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    min-height: 48px;
    gap: 12px;
    padding: 0 14px 0 18px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  title: css`
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 9px;
    color: ${token.colorText};
  `,
  titleMark: css`
    display: inline-grid;
    width: 28px;
    height: 22px;
    place-items: center;
    border-radius: 7px;
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimary};
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
  `,
  closeButton: css`
    && {
      display: inline-flex;
      width: 30px;
      min-width: 30px;
      height: 30px;
      align-items: center;
      justify-content: center;
      padding: 0;
      color: ${token.colorTextSecondary};
    }
  `,
  body: css`
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 14px 16px 12px 18px;
  `,
  toolbar: css`
    display: grid;
    min-width: 0;
    gap: 10px;
    padding: 0 0 14px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  toolbarRow: css`
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
  `,
  conversationSelect: css`
    && {
      width: 0;
      min-width: 0;
      flex: 1 1 0;
    }
  `,
  newConversationButton: css`
    && {
      flex: 0 0 auto;
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
  messageContent: css`
    &[data-loading="true"] {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
  `,
  messageAction: css`
    && {
      justify-self: end;
      height: 24px;
      padding-inline: 4px;
      color: ${token.colorTextSecondary};
      font-size: 12px;
    }
  `,
  proposal: css`
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid ${token.colorPrimaryBorder};
    border-radius: ${token.borderRadiusLG}px;
    background: color-mix(
      in srgb,
      ${token.colorPrimaryBg} 55%,
      ${token.colorBgContainer}
    );
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
  proposalProgress: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  streamCursor: css`
    display: inline-block;
    width: 2px;
    height: 1em;
    margin-inline-start: 3px;
    vertical-align: -0.12em;
    background: ${token.colorPrimary};
    animation: ai-stream-cursor 0.8s steps(1, end) infinite;

    @keyframes ai-stream-cursor {
      50% {
        opacity: 0;
      }
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
