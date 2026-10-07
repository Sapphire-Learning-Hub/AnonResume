import { createStyles } from "antd-style";

export const useAccountCenterStyles = createStyles(({ token, css }) => ({
  page: css`
    display: grid;
    min-width: 0;
  `,
  header: css`
    display: flex;
    align-items: center;
    min-height: 64px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  title: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
  `,
  sectionLoading: css`
    display: grid;
    min-height: 160px;
    place-items: center;
  `,
  sectionError: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    min-height: 88px;
    padding: 18px;
    border: 1px solid ${token.colorWarningBorder};
    border-radius: 8px;
    color: ${token.colorText};
    background: ${token.colorWarningBg};
  `,
  sectionErrorIcon: css`
    color: ${token.colorWarning};
    font-size: 18px;
  `,
  layout: css`
    display: grid;
    min-width: 0;
    grid-template-columns: 190px minmax(0, 1fr);

    @media (max-width: 720px) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
  `,
  sidebar: css`
    min-width: 0;
    padding: 24px 14px 24px 0;
    border-right: 1px solid ${token.colorBorderSecondary};

    @media (max-width: 720px) {
      padding: 10px 0;
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
  `,
  navigation: css`
    display: grid;
    gap: 4px;

    @media (max-width: 720px) {
      display: flex;
      gap: 6px;
    }
  `,
  navigationItem: css`
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 36px;
    gap: 10px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    color: ${token.colorText};
    background: transparent;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;

    &:hover {
      color: ${token.colorText};
      background: ${token.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }

    &[data-active="true"] {
      color: ${token.colorPrimaryText};
      background: ${token.colorPrimaryBg};
    }

    @media (max-width: 720px) {
      width: auto;
      flex: 0 0 auto;
      white-space: nowrap;
    }
  `,
  navigationIcon: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    font-size: 16px;
  `,
  content: css`
    min-width: 0;
    padding: 28px 0 48px 32px;

    @media (max-width: 720px) {
      padding: 22px 0 40px;
    }
  `,
  section: css`
    display: grid;
    max-width: 960px;
    gap: 24px;
  `,
  sectionHeader: css`
    display: grid;
    gap: 5px;
    padding-bottom: 18px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  sectionTitle: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 20px;
  `,
  split: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;

    @media (max-width: 860px) {
      grid-template-columns: 1fr;
    }
  `,
  panel: css`
    display: grid;
    align-content: start;
    gap: 14px;
    min-width: 0;
    padding: 18px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    background: ${token.colorFillQuaternary};
  `,
  emailFlow: css`
    display: grid;
    max-width: 620px;
    gap: 24px;
  `,
  emailSteps: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    max-width: 560px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  emailStep: css`
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    color: ${token.colorTextSecondary};
    background: ${token.colorFillQuaternary};
    font-size: 13px;

    &[data-state="current"] {
      border-color: ${token.colorPrimaryBorder};
      color: ${token.colorPrimaryText};
      background: ${token.colorPrimaryBg};
    }

    &[data-state="complete"] {
      color: ${token.colorText};
      background: ${token.colorFillTertiary};
    }

    @media (max-width: 620px) {
      align-items: flex-start;
      flex-direction: column;
    }
  `,
  emailStepNumber: css`
    display: inline-grid;
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 50%;
    font-size: 11px;
  `,
  formPanel: css`
    display: grid;
    align-content: start;
    max-width: 620px;
    gap: 16px;
    min-width: 0;
    padding: 20px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    background: ${token.colorFillQuaternary};
  `,
  panelTitle: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 16px;
  `,
  field: css`
    display: grid;
    gap: 7px;
  `,
  label: css`
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 600;
  `,
  actionRow: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  `,
  verificationInputRow: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;

    @media (max-width: 520px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  sessionList: css`
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  `,
  session: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 12px;

    @media (max-width: 620px) {
      align-items: flex-start;
      flex-direction: column;
    }
  `,
  sessionInfo: css`
    display: grid;
    min-width: 0;
    gap: 3px;
  `,
  sessionMeta: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  dataRow: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 20px;

    @media (max-width: 620px) {
      grid-template-columns: 1fr;
    }
  `,
  dangerPanel: css`
    display: grid;
    align-content: start;
    gap: 14px;
    min-width: 0;
    padding: 18px;
    border: 1px solid ${token.colorErrorBorder};
    border-radius: 8px;
    background: ${token.colorErrorBg};
  `,
  muted: css`
    margin: 0;
    color: ${token.colorTextSecondary};
  `,
  warningText: css`
    margin: 0;
    color: ${token.colorText};
    line-height: 1.7;
  `,
  deletionActionRow: css`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  `,
  modalBody: css`
    display: grid;
    gap: 16px;
  `,
}));
