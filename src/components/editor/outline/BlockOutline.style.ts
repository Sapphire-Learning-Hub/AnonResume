"use client";
import { createStyles } from "antd-style";

export const useBlockOutlineStyles = createStyles(({ css, token }) => ({
  contents: css`
    grid-column: 1 / -1;
    min-width: 0;
    padding: 2px 0 4px;
  `,
  prefix: css`
    display: inline-flex;
    position: absolute;
    left: -4px;
    top: 3px;
    z-index: 1;
  `,
  row: css`
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 34px;
    padding: 2px 3px;
    border-radius: ${token.borderRadiusSM}px;
    color: ${token.colorText};
    &[aria-selected="true"] {
      background: ${token.colorPrimaryBg};
      color: ${token.colorPrimaryText};
    }
    &[data-dragging="true"] {
      opacity: 0.4;
    }
    &:hover:not([aria-selected="true"]),
    &:focus-within:not([aria-selected="true"]) {
      background: ${token.colorFillTertiary};
    }
    &[data-drop="before"]::before,
    &[data-drop="after"]::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background: ${token.colorPrimary};
      pointer-events: none;
      z-index: 2;
    }
    &[data-drop="before"]::before {
      top: -1px;
    }
    &[data-drop="after"]::after {
      bottom: -1px;
    }
    &:hover > [data-outline-actions],
    &:focus-within > [data-outline-actions],
    &[aria-selected="true"] > [data-outline-actions] {
      opacity: 1;
    }
  `,
  select: css`
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 6px;
    padding: 4px 2px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    line-height: 1.5;
    text-align: left;
    cursor: pointer;
    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: 1px;
      border-radius: ${token.borderRadiusSM}px;
    }
  `,
  label: css`
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
  `,
  count: css`
    color: ${token.colorTextTertiary};
    font-size: 11px;
    flex-shrink: 0;
  `,
  thumbnail: css`
    width: 22px;
    height: 26px;
    object-fit: contain;
    flex-shrink: 0;
  `,
  control: css`
    && {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: ${token.borderRadiusSM}px;
      background: transparent;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      width: 22px;
      min-width: 22px;
      height: 26px;
      padding: 0;
      color: ${token.colorTextSecondary};
      flex-shrink: 0;
      &:hover:not(:disabled) {
        background: ${token.colorFillSecondary};
        color: ${token.colorPrimary};
      }
      &:disabled {
        color: ${token.colorTextDisabled};
        cursor: not-allowed;
      }
    }
  `,
  handle: css`
    && {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: ${token.borderRadiusSM}px;
      background: transparent;
      font: inherit;
      font-size: 12px;
      width: 20px;
      min-width: 20px;
      height: 26px;
      padding: 0;
      color: ${token.colorTextTertiary};
      cursor: grab;
      touch-action: none;
      &:disabled {
        color: ${token.colorTextDisabled};
        cursor: not-allowed;
      }
      &:hover:not(:disabled) {
        background: ${token.colorFillSecondary};
        color: ${token.colorPrimary};
      }
    }
  `,
  toggleSpace: css`
    width: 20px;
    flex-shrink: 0;
  `,
  actions: css`
    display: flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 120ms ease;
  `,
  overlay: css`
    max-width: 260px;
    padding: 8px 12px;
    border: 1px solid ${token.colorPrimaryBorder};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorBgElevated};
    box-shadow: ${token.boxShadowSecondary};
    color: ${token.colorText};
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  live: css`
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  `,
  tree: css`
    min-width: 0;
  `,
}));
