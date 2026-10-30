"use client";

import { createStyles } from "antd-style";

export const useResumeRendererStyles = createStyles(({ css, token }) => ({
  root: css`
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    gap: 24px;

    @media (max-width: 640px) {
      &[data-resume-responsive-view="true"] {
        gap: 16px;

        [data-resume-page="true"],
        [data-resume-measurement-surface="true"] {
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
  measurementFrame: css`
    /* Keep full layout measurable in screen and print without adding a page. */
    position: absolute;
    top: 0;
    width: 210mm;
    max-width: 100%;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
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
  documentSurface: css`
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 210mm;
    padding: var(--resume-page-padding);
    background: var(--resume-page-background);
    font-family: var(--resume-font-family);
    color: var(--resume-text-color);
    font-size: var(--resume-base-font-size);
    line-height: var(--resume-line-height);
    overflow: hidden;

    [data-resume-inline-tag="true"] {
      display: inline;
      padding: 0.12em 0.48em;
      border: 1px solid var(--resume-accent-border);
      border-radius: 999px;
      background: var(--resume-accent-surface);
      color: var(--resume-accent-foreground);
      font-size: 0.9em;
      font-weight: 600;
      line-height: 1;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }

    [data-resume-link="true"] {
      color: var(--resume-accent-foreground);
      text-decoration: none;

      &[data-resume-link-underline="true"] {
        text-decoration: underline;
      }
    }
  `,
  page: css`
    min-height: 297mm;
    box-shadow: 0 20px 48px rgba(15, 23, 42, 0.14);
  `,
  sectionSurface: css`
    min-height: 0;
    box-shadow: 0 16px 38px rgba(15, 23, 42, 0.13);
  `,
  pageContent: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--resume-section-gap);
  `,
  sectionFlow: css`
    display: flex;
    min-width: 0;
    flex-direction: column;
  `,
  section: css`
    display: flex;
    flex-direction: column;
  `,
  sectionTitle: css`
    margin: 0;
    margin-bottom: 12px;
    color: var(--resume-accent-foreground);
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
  layoutSelectionTarget: css`
    &[data-resume-block-selected="true"][data-resume-edit-surface-mode="layout"] {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: 3px;
    }
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

    &:hover:not(:has([data-resume-block-path]:hover)) > button,
    &[data-resume-block-selected="true"] > button,
    &:focus-within:not(:has([data-resume-block-path]:focus-within)) > button {
      opacity: 1;
      pointer-events: auto;
    }
    &:hover:not(:has([data-resume-block-path]:hover)) > [data-resume-sort-chrome="true"],
    &[data-resume-block-selected="true"] > [data-resume-sort-chrome="true"] {
      opacity: 1;
    }

    &[data-resume-block-selected="true"][data-resume-edit-surface-mode="layout"] {
      outline: 2px solid ${token.colorPrimary};
      outline-offset: 3px;
    }

    &[data-resume-dragging="true"] {
      opacity: 0.76;
    }
  `,
  sortableBlockChrome: css`
    opacity: 0;
    position: absolute;
    inset: -8px;
    border: 1px dashed ${token.colorPrimaryBorder};
    border-radius: 20px;
    pointer-events: none;
    z-index: 1;

    &[data-resume-handle-placement="floating"] {
      inset-right: -22px;
    }

    &[data-resume-dragging="true"] {
      border-color: ${token.colorPrimary};
      box-shadow:
        0 16px 30px rgba(15, 23, 42, 0.1),
        inset 0 0 0 1px ${token.colorPrimaryBorder};
    }

    &[data-resume-over="true"] {
      border-color: ${token.colorPrimary};
      box-shadow: inset 0 0 0 1px ${token.colorPrimaryBorder};
    }
  `,
  sortableBlockStack: css`
    position: relative;

    &[data-resume-sort-layer="active"]
      > [data-resume-block-path]
      > [data-resume-sort-chrome="true"] {
        border-color: ${token.colorPrimaryBorder};
      }
  `,
  blockDragHandle: css`
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
    position: absolute;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid ${token.colorPrimaryBorder};
    border-radius: 999px;
    background: ${token.colorBgElevated};
    color: ${token.colorTextSecondary};
    font-size: 11px;
    line-height: 1;
    letter-spacing: -0.08em;
    cursor: grab;
    box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);

    &:active {
      cursor: grabbing;
    }
    &:focus-visible {
      opacity: 1;
      pointer-events: auto;
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

    &[data-style-scope="resume-rich-text"] {
      p {
        margin: 0;
      }

      a {
        color: var(--resume-accent-foreground);
        text-decoration: none;

        &[data-resume-link-underline="true"] {
          text-decoration: underline;
        }
      }
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
    border: 1px solid var(--resume-accent-border);
    border-radius: 999px;
    background: var(--resume-accent-surface);
    color: var(--resume-accent-foreground);
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
  `,
  editableBadge: css`
    appearance: none;
    cursor: pointer;
    font-family: inherit;
  `,
  badgeEditor: css`
    cursor: text;
    font-family: inherit;
    outline: 0;
  `,
}));
