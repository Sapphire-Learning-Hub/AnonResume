"use client";

import { createStyles } from "antd-style";

export const useResumeEditorShellStyles = createStyles(({ token, css }) => ({
  shell: css`
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background: ${token.colorBgLayout};
  `,
  toolbar: css`
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    min-height: 64px;
    padding: 8px 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    background: color-mix(in srgb, ${token.colorBgContainer} 96%, transparent);
    backdrop-filter: blur(16px);
    position: sticky;
    top: 0;
    z-index: 20;

    @media (max-width: 1180px) {
      flex-wrap: wrap;
      padding: 10px 12px;
    }
  `,
  backButton: css`
    && {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 8px;
      font-size: 20px;
      line-height: 1;
      color: ${token.colorTextSecondary};

      &:hover {
        color: ${token.colorText};
        background: ${token.colorFillTertiary};
      }

      svg {
        flex: 0 0 18px;
      }
    }
  `,
  toolbarIdentity: css`
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  `,
  titleStack: css`
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  `,
  toolbarLabel: css`
    font-size: 12px;
    font-weight: 700;
    color: ${token.colorTextTertiary};
    white-space: nowrap;
  `,
  toolbarValue: css`
    overflow: hidden;
    font-size: 16px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: ${token.colorText};
  `,
  saveStatus: css`
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 12px;
    border-left: 1px solid ${token.colorBorderSecondary};
  `,
  toolbarActionRail: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
    align-items: center;
    margin-left: auto;

    @media (max-width: 1180px) {
      margin-left: 0;
    }
  `,
  toolbarActionGroup: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    padding-left: 8px;
    border-left: 1px solid ${token.colorBorderSecondary};

    &:first-child {
      padding-left: 0;
      border-left: 0;
    }
  `,
  richTextToolbar: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
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
    grid-template-columns: minmax(240px, 272px) minmax(0, 1fr) minmax(320px, 360px);
    flex: 1;
    min-height: 0;
    align-items: stretch;

    @media (max-width: 1440px) {
      grid-template-columns: 204px minmax(0, 1fr) 272px;
    }

    @media (max-width: 1180px) {
      grid-template-columns: minmax(208px, 240px) minmax(0, 1fr);
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
    position: sticky;
    top: var(--editor-sticky-offset, 64px);
    max-height: calc(100dvh - var(--editor-sticky-offset, 64px));
    overflow: auto;
    padding: 10px 14px 18px;
    border-right: 1px solid ${token.colorBorderSecondary};
    background: color-mix(in srgb, ${token.colorBgContainer} 88%, transparent);

    @media (max-width: 1180px) {
      padding: 10px 12px 16px;
    }

    @media (max-width: 960px) {
      position: static;
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
  panelSection: css`
    display: flex;
    flex-direction: column;
    gap: 10px;

    & + & {
      padding-top: 14px;
      border-top: 1px solid ${token.colorBorderSecondary};
    }
  `,
  sectionEyebrow: css`
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${token.colorTextTertiary};
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
    flex-wrap: wrap;
    gap: 10px;
  `,
  presetButtonList: css`
    display: grid;
    gap: 8px;
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
    height: calc(100dvh - var(--editor-sticky-offset, 64px));
    min-height: 0;
    overflow: hidden;
    padding: 0;
    background:
      radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.1), transparent 42%),
      #626974;

    @media (max-width: 960px) {
      height: auto;
      min-height: calc(100dvh - var(--editor-sticky-offset, 64px));
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
  canvasSafeAreaButton: css`
    && {
      color: rgba(255, 255, 255, 0.88);
      border-color: rgba(255, 255, 255, 0.22);
      background: rgba(15, 23, 42, 0.18);

      &:hover,
      &[aria-pressed="true"] {
        color: #ffffff;
        border-color: color-mix(in srgb, ${token.colorPrimary} 72%, white);
        background: color-mix(in srgb, ${token.colorPrimary} 34%, transparent);
      }
    }
  `,
  canvasPageCount: css`
    color: rgba(255, 255, 255, 0.68);
    font-size: 12px;
    white-space: nowrap;
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
  inspectorPanel: css`
    position: sticky;
    top: var(--editor-sticky-offset, 64px);
    max-height: calc(100dvh - var(--editor-sticky-offset, 64px));
    overflow: hidden;
    gap: 0;
    padding: 0 16px;
    border-left: 1px solid ${token.colorBorderSecondary};
    background: color-mix(in srgb, ${token.colorBgContainer} 96%, transparent);

    @media (max-width: 1180px) {
      grid-column: 1 / -1;
      position: static;
      max-height: none;
      overflow: visible;
      border-top: 1px solid ${token.colorBorderSecondary};
      border-left: 0;
    }
  `,
  inspectorPanelHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 30px;
    padding: 10px 0 8px;
    background: ${token.colorBgContainer};
    box-shadow: 0 1px 0 ${token.colorBorderSecondary};
  `,
  drawerContent: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 14px;
    min-height: 0;
    padding: 14px 0 24px;
    overflow-y: auto;
    overscroll-behavior: contain;

    @media (max-width: 1180px) {
      flex: none;
      overflow: visible;
    }
  `,
  drawerSectionHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `,
  drawerSectionTitle: css`
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${token.colorTextSecondary};
  `,
  drawerSummary: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 16px;
    border-radius: 18px;
    background: ${token.colorFillTertiary};
  `,
  drawerSummaryLabel: css`
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${token.colorTextTertiary};
  `,
  drawerSummaryValue: css`
    font-weight: 600;
    color: ${token.colorText};
  `,
  inspectorList: css`
    display: grid;
    gap: 12px;
  `,
  inspectorControlGrid: css`
    display: grid;
    gap: 12px;
  `,
  inspectorControlRow: css`
    display: grid;
    gap: 6px;
  `,
  inspectorControlLabel: css`
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${token.colorTextTertiary};
  `,
  fontPresetOption: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    gap: 10px;
  `,
  fontPresetName: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  fontPresetMeta: css`
    flex: 0 0 auto;
    color: ${token.colorTextTertiary};
    font-size: 11px;
  `,
  inspectorLabelWithHint: css`
    display: flex;
    align-items: center;
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
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1;
  `,
  colorThemeGroup: css`
    display: grid;
    gap: 6px;
  `,
  colorThemeGrid: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  `,
  colorThemeItem: css`
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    min-width: 0;
    padding: 4px 8px;
    border: 1px solid ${token.colorBorder};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorBgContainer};
  `,
  colorThemeLabel: css`
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    color: ${token.colorTextSecondary};
  `,
  alignButtonRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  `,
  inspectorItem: css`
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-radius: 14px;
    background: ${token.colorFillTertiary};
  `,
  inspectorLabel: css`
    font-weight: 600;
  `,
  inspectorValue: css`
    color: ${token.colorTextSecondary};
  `,
  emptyState: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    line-height: 1.7;
  `,
}));
