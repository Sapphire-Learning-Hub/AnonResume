"use client";

import { createStyles } from "antd-style";

export const useResumeEditingCanvasStyles = createStyles(({ css }) => ({
  canvas: css`
    position: relative;
    box-sizing: content-box;
    width: var(--resume-edit-page-width);
    max-width: 100%;
    padding-top: 22px;
  `,
  pageLayer: css`
    position: absolute;
    z-index: 0;
    inset: 22px 0 0;
    pointer-events: none;
  `,
  page: css`
    position: absolute;
    box-sizing: border-box;
    width: var(--resume-edit-page-width);
    height: var(--resume-edit-page-height);
    background: var(--resume-page-background);
    box-shadow: 0 20px 48px rgba(15, 23, 42, 0.14);
  `,
  pageLabel: css`
    position: absolute;
    top: -20px;
    left: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.92);
  `,
  safeArea: css`
    position: absolute;
    inset: var(--resume-page-padding);
    border: 1px dashed rgba(15, 98, 254, 0.28);
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.04);
  `,
  content: css`
    position: relative;
    z-index: 1;
    box-sizing: border-box;
    width: var(--resume-edit-page-width);
    min-height: var(--resume-edit-page-height);
    padding: var(--resume-page-padding);
    font-family: var(--resume-font-family);
    font-size: var(--resume-base-font-size);
    line-height: var(--resume-line-height);
    color: var(--resume-text-color);
  `,
}));
