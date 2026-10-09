import { createStyles } from "antd-style";

export const useAccountMergeFlowStyles = createStyles(({ token, css }) => ({
  body: css`
    display: grid;
    gap: 20px;
  `,
  intro: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    line-height: 1.7;
  `,
  fields: css`
    display: grid;
    gap: 16px;
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
  fieldError: css`
    color: ${token.colorErrorText};
    font-size: 12px;
  `,
  summaryGrid: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;

    @media (max-width: 560px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  summary: css`
    display: grid;
    gap: 7px;
    min-width: 0;
    padding: 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    background: ${token.colorFillQuaternary};
  `,
  summaryTitle: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 15px;
  `,
  summaryMeta: css`
    overflow-wrap: anywhere;
    color: ${token.colorTextSecondary};
    font-size: 13px;
  `,
  choices: css`
    && {
      display: grid;
      gap: 10px;
    }
  `,
  choice: css`
    && {
      display: flex;
      width: 100%;
      margin: 0;
      padding: 12px 14px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: 8px;
      background: ${token.colorBgContainer};

      &:has(input:checked) {
        border-color: ${token.colorPrimaryBorder};
        background: ${token.colorPrimaryBg};
      }
    }
  `,
  warning: css`
    margin: 0;
    padding: 12px 14px;
    border: 1px solid ${token.colorWarningBorder};
    border-radius: 8px;
    color: ${token.colorWarningText};
    background: ${token.colorWarningBg};
    line-height: 1.65;
  `,
  status: css`
    display: grid;
    min-height: 180px;
    place-items: center;
    align-content: center;
    gap: 14px;
    text-align: center;
  `,
  statusTitle: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 18px;
  `,
  statusText: css`
    max-width: 440px;
    margin: 0;
    color: ${token.colorTextSecondary};
    line-height: 1.65;
  `,
}));
