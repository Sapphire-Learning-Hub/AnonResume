"use client";

import { createStyles } from "antd-style";

export const useResumeEditorShellStyles = createStyles(({ token, css }) => ({
  shell: css`
    display: flex;
    flex-direction: column;
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
    background: ${token.colorBgLayout};
  `,
  ribbonIconButton: css`
    && {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      min-width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 6px;
      color: ${token.colorTextSecondary};

      &:hover,
      &:focus-visible {
        color: ${token.colorText};
        background: ${token.colorFillTertiary};
      }
    }
  `,
  ribbonControlGroup: css`
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: max-content;
  `,
  linkInput: css`
    && {
      width: clamp(220px, 28vw, 320px);
    }
  `,
  versionHistoryModal: css`
    display: grid;
    gap: 14px;
  `,
  versionHistoryDescription: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    line-height: 1.55;
  `,
  versionHistoryError: css`
    margin: 0;
    color: ${token.colorError};
    font-size: 13px;
  `,
  versionHistoryList: css`
    display: grid;
    gap: 8px;
    max-height: min(42dvh, 360px);
    overflow: auto;
  `,
  versionHistoryItem: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 10px;
    background: ${token.colorFillQuaternary};
  `,
  versionHistoryMeta: css`
    display: grid;
    min-width: 0;
    gap: 3px;

    strong {
      color: ${token.colorText};
    }

    span {
      color: ${token.colorTextSecondary};
      font-size: 12px;
    }
  `,
  versionHistoryActions: css`
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
  `,
  body: css`
    display: grid;
    grid-template-columns: minmax(240px, 272px) minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    align-items: stretch;
    overflow: hidden;

    @media (max-width: 1440px) {
      grid-template-columns: 204px minmax(0, 1fr);
    }

    @media (max-width: 1180px) {
      grid-template-columns: 180px minmax(0, 1fr);
    }

    @media (max-width: 960px) {
      grid-template-columns: 1fr;
    }
  `,
  panel: css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  `,
  sidebar: css`
    position: relative;
    height: 100%;
    max-height: none;
    min-height: 0;
    overflow: auto;
    padding: 10px 14px 18px;
    border-right: 1px solid ${token.colorBorderSecondary};
    background: color-mix(in srgb, ${token.colorBgContainer} 88%, transparent);

    @media (max-width: 1180px) {
      padding: 10px 12px 16px;
    }

    @media (max-width: 960px) {
      position: static;
      height: auto;
      max-height: none;
      overflow: visible;
      border-right: 0;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
  `,
  panelHeading: css`
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  `,
  columnStickyHeader: css`
    position: sticky;
    top: 0;
    z-index: 5;
    flex: 0 0 auto;

    @media (max-width: 960px) {
      position: static;
    }
  `,
  sidebarHeader: css`
    display: flex;
    align-items: center;
    min-height: 30px;
    padding-bottom: 8px;
    background: ${token.colorBgContainer};
    box-shadow: 0 1px 0 ${token.colorBorderSecondary};
  `,
  panelDescription: css`
    margin: 0;
    font-size: 13px;
    color: ${token.colorTextSecondary};
    line-height: 1.5;
  `,
  outlineList: css`
    display: flex;
    flex-direction: column;
    gap: 10px;
  `,
  outlineItem: css`
    display: grid;
    gap: 8px;
    align-items: stretch;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      opacity 160ms ease;
    cursor: grab;

    &:active {
      cursor: grabbing;
    }

    &[data-dragging="true"] {
      opacity: 0.72;
    }

    &[data-over="true"] {
      border-radius: 18px;
      box-shadow: inset 0 0 0 2px
        color-mix(in srgb, ${token.colorPrimary} 18%, transparent);
    }
  `,
  panelActionRow: css`
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 4px;
  `,
  compactActionRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    justify-content: flex-end;
    width: 100%;
    margin-top: 2px;
    padding-top: 8px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  outlineButton: css`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 6px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 10px;
    background: ${token.colorBgContainer};
    text-align: left;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.35;
    color: ${token.colorText};
    cursor: pointer;

    &:hover {
      border-color: color-mix(in srgb, ${token.colorPrimary} 40%, transparent);
    }

    &[aria-pressed="true"] {
      border-color: color-mix(in srgb, ${token.colorPrimary} 35%, transparent);
      box-shadow: 0 0 0 3px
        color-mix(in srgb, ${token.colorPrimary} 8%, transparent);
    }
  `,
  outlineMeta: css`
    font-size: 12px;
    color: ${token.colorTextSecondary};
  `,
  canvasPanel: css`
    gap: 0;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    padding: 0;
    background:
      radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.1), transparent 42%),
      #626974;

    @media (max-width: 960px) {
      height: auto;
      min-height: 0;
      overflow: visible;
    }
  `,
  canvasHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 28px;
    gap: 8px;
    color: rgba(255, 255, 255, 0.78);
    padding: 10px 20px 8px;
    background: #626974;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.14);

    @media (max-width: 1180px) {
      padding-inline: 16px;
    }

    @media (min-width: 1181px) and (max-width: 1440px) {
      padding-inline: 0;
    }

    h2 {
      color: inherit;
    }
  `,
  canvasMeta: css`
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  `,
  canvasHeaderActions: css`
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  canvasModeTag: css`
    && {
      margin-inline-end: 0;
      border: 0;
      opacity: 0.9;
    }
  `,
  canvasViewport: css`
    display: flex;
    justify-content: center;
    align-items: flex-start;
    flex: 1;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;
    padding: 18px 20px 48px;

    @media (max-width: 1180px) {
      padding-inline: 16px;
    }

    @media (min-width: 1181px) and (max-width: 1440px) {
      padding-inline: 0;
    }
  `,
  canvasZoom: css`
    transform-origin: top center;
    transition: transform 160ms ease;
    margin: 0 auto;
  `,
  ribbonPropertyPanel: css`
    display: flex;
    align-items: center;
    min-width: max-content;
    height: 49px;
  `,
  inspectorControlGrid: css`
    display: flex;
    align-items: center;
    min-width: max-content;
    gap: 8px;
  `,
  inspectorControlRow: css`
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 5px;

    > * {
      min-width: 0;
    }

    > :last-child {
      width: 92px;
      flex: 0 0 auto;
    }

    &[data-field-size="compact"] > :last-child {
      width: 60px;
    }

    &[data-field-size="medium"] > :last-child {
      width: 124px;
    }

    &[data-field-size="wide"] > :last-child {
      width: 190px;
    }

    &[data-field-size="select-medium"] > :last-child {
      width: 180px;
    }

    &[data-field-size="select-wide"] > :last-child {
      width: 220px;
    }

    &[data-field-size="color"] > :last-child {
      width: 40px;
    }

    &[data-field-size="auto"] > :last-child {
      width: auto;
    }
  `,
  documentPropertyStack: css`
    display: flex;
    align-items: center;
    min-width: max-content;
    gap: 8px;
  `,
  documentPropertyPair: css`
    display: flex;
    align-items: center;
    min-width: max-content;
    gap: 8px;
  `,
  documentColorStack: css`
    display: flex;
    align-items: center;
    min-width: max-content;
    gap: 8px;
  `,
  documentMarginGrid: css`
    display: flex;
    align-items: center;
    min-width: max-content;
    gap: 8px;
  `,
  inspectorControlLabel: css`
    flex: 0 0 auto;
    color: ${token.colorTextSecondary};
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  `,
  fontPresetOption: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    gap: 10px;
  `,
  fontPresetName: css`
    flex: 0 0 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  fontPresetMeta: css`
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: ${token.colorTextTertiary};
    font-size: 11px;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  inspectorLabelWithHint: css`
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 4px;
  `,
  inspectorHelpButton: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: ${token.colorTextTertiary};
    cursor: help;

    &:hover,
    &:focus-visible {
      color: ${token.colorPrimary};
    }

    &:focus-visible {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: 2px;
    }
  `,
  colorControl: css`
    box-sizing: border-box;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 28px;
    padding: 0;
    overflow: hidden;
    border: 1px solid ${token.colorBorder};
    border-radius: 6px;
    background: ${token.colorBgContainer};
  `,
  alignButtonRow: css`
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 4px;
  `,
}));
