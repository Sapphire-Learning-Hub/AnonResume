"use client";

import { createStyles } from "antd-style";

export const useEditorWorkspaceResizeHandleStyles = createStyles(
  ({ css, token }) => ({
    handle: css`
      position: absolute;
      z-index: 4;
      top: 0;
      right: -5px;
      bottom: 0;
      width: 10px;
      border: 0;
      outline: 0;
      background: transparent;
      cursor: col-resize;
      touch-action: none;

      &::after {
        position: absolute;
        top: 0;
        right: 4px;
        bottom: 0;
        width: 2px;
        background: transparent;
        content: "";
        transition: background-color 120ms ease;
      }

      &:hover::after,
      &:focus-visible::after,
      &[data-resizing="true"]::after {
        background: ${token.colorPrimary};
      }
    `,
  }),
);
