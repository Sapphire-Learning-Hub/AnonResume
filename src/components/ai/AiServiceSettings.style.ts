"use client";

import { createStyles } from "antd-style";

export const useAiServiceSettingsStyles = createStyles(({ token, css }) => ({
  page: css`
    display: grid;
    gap: 20px;
    padding-top: 20px;
  `,
  heading: css`
    display: grid;
    gap: 6px;

    h1,
    p {
      margin: 0;
    }

    p {
      color: ${token.colorTextSecondary};
    }
  `,
  overview: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;

    @media (max-width: 900px) {
      grid-template-columns: 1fr;
    }
  `,
  metric: css`
    display: grid;
    gap: 6px;
    padding: 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorFillQuaternary};

    span {
      color: ${token.colorTextSecondary};
      font-size: 13px;
    }

    strong {
      font-size: 22px;
    }
  `,
  card: css`
    && {
      max-width: 820px;
    }
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  `,
}));
