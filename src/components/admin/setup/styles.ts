import { createStyles } from "antd-style";

export const useAdminSetupStyles = createStyles(({ token, css }) => ({
  page: css`
    min-height: 100dvh;
    display: grid;
    grid-template-columns: minmax(280px, 0.9fr) minmax(420px, 1.1fr);
    background:
      radial-gradient(circle at 12% 18%, color-mix(in srgb, ${token.colorPrimary} 16%, transparent), transparent 34%),
      linear-gradient(135deg, ${token.colorBgLayout}, ${token.colorBgContainer});

    @media (max-width: 860px) {
      grid-template-columns: 1fr;
    }
  `,
  introduction: css`
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 100dvh;
    padding: clamp(32px, 6vw, 84px);
    border-right: 1px solid ${token.colorBorderSecondary};

    @media (max-width: 860px) {
      min-height: auto;
      gap: 32px;
      padding-bottom: 24px;
      border-right: 0;
    }
  `,
  logo: css`
    width: min(240px, 72vw);
    height: auto;
  `,
  introductionCopy: css`
    max-width: 520px;
  `,
  eyebrow: css`
    margin: 0 0 12px;
    color: ${token.colorPrimary};
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  `,
  heroTitle: css`
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: clamp(34px, 5vw, 64px);
    line-height: 1.08;
  `,
  heroDescription: css`
    margin: 22px 0 0;
    color: ${token.colorTextSecondary};
    font-size: 17px;
    line-height: 1.8;
  `,
  workspace: css`
    display: grid;
    place-items: center;
    min-width: 0;
    padding: clamp(24px, 6vw, 84px);

    @media (max-width: 860px) {
      place-items: start center;
      padding-top: 8px;
    }
  `,
  panel: css`
    width: min(560px, 100%);
    padding: clamp(24px, 4vw, 42px);
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 24px;
    background: color-mix(in srgb, ${token.colorBgContainer} 94%, transparent);
    box-shadow: ${token.boxShadowSecondary};
  `,
  title: css`
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: 30px;
    line-height: 1.25;
  `,
  description: css`
    margin: 12px 0 24px;
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
