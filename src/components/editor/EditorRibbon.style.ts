"use client";

import { createStyles } from "antd-style";

const RIBBON_CONTROL_HEIGHT = 28;
const RIBBON_CONTROL_RADIUS = 6;

export const useEditorRibbonStyles = createStyles(({ token, css }) => ({
  ribbon: css`
    position: relative;
    z-index: 20;
    flex: 0 0 auto;
    min-width: 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
    color: ${token.colorText};
    box-shadow: 0 2px 8px color-mix(in srgb, ${token.colorText} 5%, transparent);

    && button,
    && a.ant-btn {
      box-sizing: border-box;
      height: ${RIBBON_CONTROL_HEIGHT}px;
      min-height: ${RIBBON_CONTROL_HEIGHT}px;
      border-radius: ${RIBBON_CONTROL_RADIUS}px;
      font-size: 12px;
    }

    && .ant-input,
    && .ant-color-picker-trigger {
      height: ${RIBBON_CONTROL_HEIGHT}px;
      min-height: ${RIBBON_CONTROL_HEIGHT}px;
      border-radius: ${RIBBON_CONTROL_RADIUS}px;
    }

    && .ant-input:not([data-testid="resume-title-input"]),
    && .ant-color-picker-trigger {
      font-size: 12px;
    }

    && .ant-select-single,
    && .ant-select-single .ant-select-selector {
      height: ${RIBBON_CONTROL_HEIGHT}px;
      min-height: ${RIBBON_CONTROL_HEIGHT}px;
      border-radius: ${RIBBON_CONTROL_RADIUS}px;
      font-size: 12px;
    }
  `,
  documentBar: css`
    display: flex;
    align-items: center;
    min-width: 0;
    height: 44px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 12px;
    gap: 8px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  `,
  quickActions: css`
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 2px;
  `,
  backButton: css`
    &&& {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: ${RIBBON_CONTROL_HEIGHT}px;
      min-width: ${RIBBON_CONTROL_HEIGHT}px;
      padding: 0;
      border-radius: ${RIBBON_CONTROL_RADIUS}px;
      color: ${token.colorTextSecondary};

      &:hover {
        color: ${token.colorText};
        background: ${token.colorFillTertiary};
      }
    }
  `,
  identity: css`
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 10px;
    margin-left: 4px;
  `,
  documentName: css`
    && {
      width: min(34vw, 420px);
      min-width: 160px;
      padding-inline: 8px;
      overflow: hidden;
      border-color: transparent;
      background: transparent;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 700;

      &:hover {
        border-color: ${token.colorBorder};
        background: ${token.colorFillQuaternary};
      }

      &:focus {
        border-color: ${token.colorPrimary};
        background: ${token.colorBgContainer};
      }
    }
  `,
  saveStatus: css`
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 6px;
    color: ${token.colorTextTertiary};
    font-size: 12px;
    white-space: nowrap;

    &::before {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${token.colorTextTertiary};
      content: "";
    }

    &[data-status-tone="warning"]::before {
      background: ${token.colorWarning};
    }

    &[data-status-tone="processing"]::before {
      background: ${token.colorInfo};
    }

    &[data-status-tone="success"]::before {
      background: ${token.colorSuccess};
    }

    &[data-status-tone="error"]::before {
      background: ${token.colorError};
    }
  `,
  documentActions: css`
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 6px;
    margin-left: auto;
  `,
  tabsViewport: css`
    display: flex;
    align-items: flex-end;
    min-width: 0;
    height: 34px;
    padding: 0 12px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  `,
  tablist: css`
    display: flex;
    align-items: stretch;
    min-width: max-content;
    height: 100%;
    gap: 2px;
  `,
  tab: css`
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 64px;
    height: ${RIBBON_CONTROL_HEIGHT}px;
    padding: 0 14px;
    border: 0;
    border-radius: ${RIBBON_CONTROL_RADIUS}px;
    background: transparent;
    color: ${token.colorTextSecondary};
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;

    &:hover {
      color: ${token.colorText};
      background: ${token.colorFillQuaternary};
    }

    &[aria-selected="true"] {
      color: ${token.colorPrimary};
      background: color-mix(in srgb, ${token.colorPrimary} 8%, ${token.colorBgContainer});
    }

    &[aria-selected="true"]::after {
      position: absolute;
      right: 12px;
      bottom: 0;
      left: 12px;
      height: 2px;
      border-radius: 2px 2px 0 0;
      background: ${token.colorPrimary};
      content: "";
    }

    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: -2px;
    }
  `,
  tabIcon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
  `,
  commandViewport: css`
    min-width: 0;
    height: 58px;
    overflow-x: auto;
    overflow-y: hidden;
    background: color-mix(in srgb, ${token.colorBgLayout} 34%, ${token.colorBgContainer});
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  `,
  commandSurface: css`
    display: flex;
    align-items: stretch;
    min-width: max-content;
    height: 58px;
    padding: 5px 10px 4px;
  `,
  commandGroup: css`
    position: relative;
    display: flex;
    align-items: flex-start;
    min-width: 0;
    height: 49px;
    padding: 0 12px 14px;
    border-right: 1px solid ${token.colorBorderSecondary};

    &:first-child {
      padding-left: 4px;
    }

    &:last-child {
      border-right: 0;
    }
  `,
  commandBody: css`
    display: flex;
    align-items: center;
    height: 32px;
    gap: 4px;
  `,
  commandLabel: css`
    position: absolute;
    right: 12px;
    bottom: 0;
    left: 12px;
    overflow: hidden;
    color: ${token.colorTextTertiary};
    font-size: 10px;
    line-height: 12px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  propertyGroup: css`
    position: relative;
    display: flex;
    align-items: flex-start;
    box-sizing: border-box;
    min-width: 0;
    height: 49px;
    padding: 0 12px 14px;
    border-right: 1px solid ${token.colorBorderSecondary};

    &:first-child {
      padding-left: 4px;
    }

    &:last-child {
      border-right: 0;
    }

    && .ant-btn {
      padding-inline: 10px;
    }

    && .ant-input {
      padding-block: 2px;
      font-size: 12px;
    }

    && .ant-select-single {
      font-size: 12px;
    }

    && .ant-select-single .ant-select-selector {
      padding-block: 0;
    }

    && .ant-select-single .ant-select-selection-item,
    && .ant-select-single .ant-select-selection-placeholder {
      line-height: 26px;
    }
  `,
  propertyGroupBody: css`
    display: flex;
    align-items: center;
    min-width: max-content;
    height: 32px;
    gap: 4px;
  `,
  propertyGroupLabel: css`
    position: absolute;
    right: 12px;
    bottom: 0;
    left: 12px;
    overflow: hidden;
    color: ${token.colorTextTertiary};
    font-size: 10px;
    line-height: 12px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));
