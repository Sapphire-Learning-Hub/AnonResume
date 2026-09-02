"use client";

import { createStyles } from "antd-style";

export const useResumeRendererStyles = createStyles(({ css }) => ({
  root: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    gap: 24px;

    @media (max-width: 640px) {
      &[data-resume-responsive-view="true"] {
        gap: 16px;

        [data-resume-page="true"] {
          width: 100%;
          min-height: 0;
          padding: 22px 18px;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.1);
        }

        [data-resume-section-title="true"] {
          margin-bottom: 10px;
          font-size: 21px;
        }
      }
    }
  `,
  pageFrame: css`
    display: grid;
    gap: 10px;
    width: 210mm;
    max-width: 100%;
  `,
  pageLabel: css`
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.92);
  `,
  page: css`
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 210mm;
    min-height: 297mm;
    padding: var(--resume-page-padding);
    background: var(--resume-page-background);
    font-family: var(--resume-font-family);
    color: var(--resume-text-color);
    box-shadow: 0 20px 48px rgba(15, 23, 42, 0.14);
    font-size: var(--resume-base-font-size);
    line-height: var(--resume-line-height);
    overflow: hidden;

    [data-resume-inline-tag="true"] {
      display: inline;
      padding: 0.12em 0.48em;
      border: 1px solid
        color-mix(in srgb, var(--resume-accent) 18%, transparent);
      border-radius: 999px;
      background: color-mix(
        in srgb,
        var(--resume-accent) 8%,
        var(--resume-page-background)
      );
      color: var(--resume-accent);
      font-size: 0.9em;
      font-weight: 600;
      line-height: 1;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
  `,
  printSafeArea: css`
    position: absolute;
    z-index: 4;
    inset: var(--resume-page-padding);
    border: 1px dashed rgba(15, 98, 254, 0.28);
    border-radius: 4px;
    pointer-events: none;
    box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.04);

    @media print {
      display: none;
    }
  `,
  pageContent: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--resume-section-gap);
  `,
  section: css`
    display: flex;
    flex-direction: column;
  `,
  sectionTitle: css`
    margin: 0;
    margin-bottom: 12px;
    color: var(--resume-accent);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;

    p {
      margin: 0;
    }
  `,
  blockStack: css`
    display: flex;
    flex-direction: column;
    gap: var(--resume-block-gap);
  `,
  sortableBlockItem: css`
    position: relative;
    min-width: 0;
    border-radius: 14px;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      opacity 160ms ease;

    &[data-resume-edit-surface-mode="layout"] {
      overflow: visible;
    }

    &[data-resume-dragging="true"] {
      opacity: 0.76;
    }
  `,
  sortableBlockChrome: css`
    position: absolute;
    inset: -8px;
    border: 1px dashed rgba(15, 98, 254, 0.22);
    border-radius: 20px;
    pointer-events: none;
    z-index: 1;

    &[data-resume-handle-placement="floating"] {
      inset-right: -22px;
    }

    &[data-resume-dragging="true"] {
      border-color: rgba(15, 98, 254, 0.4);
      box-shadow:
        0 16px 30px rgba(15, 23, 42, 0.1),
        inset 0 0 0 1px rgba(15, 98, 254, 0.18);
    }

    &[data-resume-over="true"] {
      border-color: rgba(15, 98, 254, 0.36);
      box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.16);
    }
  `,
  sortableBlockStack: css`
    position: relative;

    &[data-resume-sort-layer="active"]
      > [data-resume-block-path]
      > [data-resume-sort-chrome="true"] {
        border-color: rgba(15, 98, 254, 0.34);
      }
  `,
  blockDragHandle: css`
    position: absolute;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 26px;
    padding: 0 8px;
    border: 1px dashed rgba(15, 98, 254, 0.32);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.94);
    color: #475569;
    font-size: 11px;
    line-height: 1;
    letter-spacing: -0.08em;
    cursor: grab;
    box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);

    &:active {
      cursor: grabbing;
    }

    &[data-resume-handle-placement="floating"] {
      top: 8px;
      right: -18px;
    }

    &[data-resume-handle-placement="inset"] {
      top: 8px;
      right: 8px;
    }
  `,
  editableTextButton: css`
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: inherit;
    letter-spacing: inherit;
    text-align: left;
    cursor: text;
  `,
  selectedEditableText: css`
    outline: 2px solid rgba(15, 98, 254, 0.35);
    border-radius: 12px;
  `,
  textEditorShell: css`
    position: relative;
    width: 100%;
  `,
  textEditorPlaceholder: css`
    visibility: hidden;
    pointer-events: none;
    user-select: none;
  `,
  textEditorOverlay: css`
    position: absolute;
    inset: 0;
  `,
  textEditor: css`
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 12px;
    font: inherit;
    color: inherit;
    background: transparent;
    outline: none;
    white-space: pre-wrap;
    box-shadow: 0 0 0 2px rgba(15, 98, 254, 0.22);

    p {
      margin: 0;
    }

    a {
      color: var(--resume-accent);
      text-decoration: underline;
    }
  `,
  group: css`
    display: flex;
    flex-direction: column;
  `,
  row: css`
    display: flex;
    width: 100%;
    flex-wrap: wrap;
  `,
  paragraph: css`
    margin: 0;
  `,
  list: css`
    margin: 0;
    padding-left: 20px;
  `,
  listItem: css`
    margin-bottom: 8px;
    color: var(--resume-text-color);
  `,
  badges: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;
  `,
  badge: css`
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    padding: 6px 10px;
    border: 1px solid rgba(15, 98, 254, 0.18);
    border-radius: 999px;
    background: rgba(15, 98, 254, 0.08);
    color: var(--resume-accent);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  `,
  editableBadge: css`
    appearance: none;
    cursor: pointer;
    font-family: inherit;
  `,
  selectedBadge: css`
    outline: 2px solid rgba(15, 98, 254, 0.42);
    outline-offset: 2px;
  `,
}));
