import { createStyles } from "antd-style";

export const useMarkdownEditingWorkspaceStyles = createStyles(
  ({ css, token }) => ({
    sourcePane: css`
      position: relative;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto minmax(96px, auto);
      min-width: 0;
      min-height: 0;
      border-right: 1px solid ${token.colorBorderSecondary};
      background: ${token.colorBgContainer};
    `,
    paneHeading: css`
      margin: 0;
      padding: 12px 14px;
      color: ${token.colorText};
      font-size: 15px;
      font-weight: 700;
    `,
    diagnostics: css`
      min-height: 0;
      max-height: 180px;
      overflow: auto;
      padding: 10px 14px 14px;
      border-top: 1px solid ${token.colorBorderSecondary};
    `,
    diagnosticsHeading: css`
      margin: 0 0 6px;
      color: ${token.colorTextSecondary};
      font-size: 12px;
      font-weight: 700;
    `,
    diagnosticsList: css`
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      gap: 4px;
      list-style: none;
    `,
    diagnosticButton: css`
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      width: 100%;
      padding: 7px 8px;
      gap: 7px;
      border: 0;
      border-radius: ${token.borderRadius}px;
      background: transparent;
      color: ${token.colorText};
      font: inherit;
      text-align: left;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        background: ${token.colorFillTertiary};
      }

      &:focus-visible {
        outline: 2px solid ${token.colorPrimaryBorder};
        outline-offset: -2px;
      }

      &[data-severity="error"] > :first-child {
        color: ${token.colorError};
      }

      &[data-severity="warning"] > :first-child {
        color: ${token.colorWarning};
      }
    `,
    diagnosticIcon: css`
      display: inline-flex;
      align-items: center;
      padding-top: 2px;
    `,
    diagnosticLine: css`
      color: ${token.colorTextSecondary};
      white-space: nowrap;
    `,
    diagnosticMessage: css`
      min-width: 0;
      overflow-wrap: anywhere;
    `,
    emptyDiagnostics: css`
      margin: 0;
      color: ${token.colorTextTertiary};
      font-size: 12px;
    `,
    stalePreview: css`
      display: inline-flex;
      align-items: center;
      margin: 0;
      padding: 10px 14px 0;
      gap: 6px;
      color: ${token.colorWarningText};
      font-size: 12px;
      font-weight: 600;
    `,
  }),
);
