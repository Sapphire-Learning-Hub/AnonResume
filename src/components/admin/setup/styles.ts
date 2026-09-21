import { createStyles } from "antd-style";

export const useAdminSetupStyles = createStyles(({ token, css }) => ({
  introduction: css`
    margin-bottom: 32px;
  `,
  heroTitle: css`
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: 26px;
    line-height: 1.2;
    letter-spacing: -0.025em;
  `,
  title: css`
    margin: 0 0 12px;
    color: ${token.colorTextHeading};
    font-size: 22px;
    line-height: 1.25;
  `,
  description: css`
    margin: 0 0 24px;
    color: ${token.colorTextSecondary};
    line-height: 1.7;
  `,
  form: css`
    display: grid;
    gap: 16px;
  `,
  field: css`
    display: grid;
    gap: 7px;
    color: ${token.colorText};
    font-weight: 600;
  `,
  qr: css`
    width: fit-content;
    margin: 22px auto 16px;
    padding: 14px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 16px;
    background: #fff;
  `,
  secret: css`
    margin: 0 0 20px;
    padding: 10px 12px;
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorFillQuaternary};
    font-family: "Noto Sans Mono Variable", monospace;
    text-align: center;
    overflow-wrap: anywhere;
  `,
  notice: css`
    && {
      margin-bottom: 18px;
    }
  `,
}));
