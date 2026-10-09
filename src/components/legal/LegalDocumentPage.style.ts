"use client";

import { createStyles } from "antd-style";

export const useLegalDocumentPageStyles = createStyles(({ token, css }) => ({
  shell: css`
    min-height: 100vh;
    padding: clamp(28px, 5vw, 64px) 20px 72px;
    background: linear-gradient(
      180deg,
      ${token.colorBgLayout} 0%,
      ${token.colorBgContainer} 100%
    );
  `,
  document: css`
    width: min(960px, 100%);
    margin: 0 auto;
    padding: clamp(24px, 4vw, 44px);
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorBgContainer};
    box-shadow: ${token.boxShadowTertiary};
  `,
  header: css`
    padding-bottom: 24px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  title: css`
    margin: 0;
    color: ${token.colorText};
    font-size: clamp(30px, 4vw, 42px);
    line-height: 1.2;
    letter-spacing: -0.02em;
  `,
  description: css`
    max-width: 720px;
    margin: 12px 0 0;
    color: ${token.colorTextSecondary};
    font-size: 15px;
    line-height: 1.75;
  `,
  metadata: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 24px 0 34px;

    > div {
      min-width: 0;
      padding: 14px 16px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadius}px;
      background: ${token.colorFillQuaternary};
    }

    dt {
      margin-bottom: 5px;
      color: ${token.colorTextTertiary};
      font-size: 12px;
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
      color: ${token.colorText};
      font-size: 13px;
      font-weight: 650;
    }

    > div > dd > a {
      color: ${token.colorPrimary};
    }

    @media (max-width: 720px) {
      grid-template-columns: 1fr;
    }
  `,
  policy: css`
    &[data-style-scope="legal-policy"] h2 {
      margin: 38px 0 12px;
      color: ${token.colorText};
      font-size: 21px;
      line-height: 1.4;
    }

    &[data-style-scope="legal-policy"] h3 {
      margin: 26px 0 10px;
      color: ${token.colorText};
      font-size: 16px;
    }

    &[data-style-scope="legal-policy"] p,
    &[data-style-scope="legal-policy"] li {
      color: ${token.colorTextSecondary};
      font-size: 14px;
      line-height: 1.85;
    }

    &[data-style-scope="legal-policy"] ul,
    &[data-style-scope="legal-policy"] ol {
      padding-left: 22px;
    }

    &[data-style-scope="legal-policy"] a {
      color: ${token.colorPrimary};
    }
  `,
  footer: css`
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    margin-top: 46px;
    padding-top: 20px;
    border-top: 1px solid ${token.colorBorderSecondary};

    > a {
      color: ${token.colorTextSecondary};
      font-size: 13px;
      font-weight: 650;
      text-decoration: none;
    }

    > a:hover,
    > a:focus-visible {
      color: ${token.colorPrimary};
    }
  `,
  preformatted: css`
    margin: 28px 0 0;
    overflow-x: auto;
    color: ${token.colorText};
    font-family: var(--font-noto-sans-mono), monospace;
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  `,
}));
