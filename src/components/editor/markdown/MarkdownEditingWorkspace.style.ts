import { createStyles } from "antd-style";

export const useMarkdownEditingWorkspaceStyles = createStyles(
  ({ css, token }) => ({
    workspace: css`
      display: grid;
      grid-template-columns: minmax(320px, 0.9fr) minmax(480px, 1.1fr);
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: ${token.colorBgLayout};

      @media (max-width: 1100px) {
        grid-template-columns: minmax(300px, 0.8fr) minmax(440px, 1.2fr);
      }
    `,
    sourcePane: css`
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) minmax(96px, auto);
      min-width: 0;
      min-height: 0;
      padding: 14px;
      gap: 10px;
      border-right: 1px solid ${token.colorBorderSecondary};
      background: ${token.colorBgContainer};
    `,
    paneHeading: css`
      margin: 0;
      color: ${token.colorText};
      font-size: 15px;
      font-weight: 700;
    `,
    diagnostics: css`
      min-height: 0;
      max-height: 180px;
      overflow: auto;
      padding-top: 10px;
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
    previewPane: css`
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: #626974;
    `,
    previewHeader: css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 46px;
      padding: 9px 18px;
      gap: 12px;
      color: rgba(255, 255, 255, 0.88);
      border-bottom: 1px solid rgba(255, 255, 255, 0.14);
    `,
    stalePreview: css`
      display: inline-flex;
      align-items: center;
      margin: 0;
      gap: 6px;
      color: #ffe58f;
      font-size: 12px;
      font-weight: 600;
    `,
    previewViewport: css`
      display: flex;
      justify-content: safe center;
      align-items: flex-start;
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 18px 20px 48px;
    `,
    previewContent: css`
      margin: 0 auto;
      transform-origin: top center;
      transition: transform 160ms ease;
      pointer-events: none;
      user-select: none;
    `,
  }),
);
