"use client";

import { createStyles } from "antd-style";

export const useAiServiceSettingsStyles = createStyles(({ token, css }) => ({
  page: css`
    display: grid;
    min-width: 0;
  `,
  loading: css`
    display: grid;
    min-height: 360px;
    place-items: center;
  `,
  pageHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 64px;
    gap: 24px;
    border-bottom: 1px solid ${token.colorBorderSecondary};

    @media (max-width: 720px) {
      align-items: flex-start;
      min-height: 0;
      flex-direction: column;
      padding: 16px 0;
    }
  `,
  heading: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
  `,
  overview: css`
    display: flex;
    align-items: center;
    min-height: 58px;
    flex-wrap: wrap;
    gap: 12px 28px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  metric: css`
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${token.colorTextSecondary};
    font-size: 13px;

    strong {
      color: ${token.colorText};
      font-size: 14px;
      font-weight: 600;
    }

    .ant-tag {
      margin: 0;
    }
  `,
  catalog: css`
    display: grid;
    min-width: 0;
    padding-bottom: 40px;
  `,
  catalogToolbar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 76px;
    gap: 20px;

    h2,
    p {
      margin: 0;
    }

    h2 {
      color: ${token.colorText};
      font-size: 16px;
      font-weight: 600;
    }

    p {
      margin-top: 4px;
      color: ${token.colorTextTertiary};
      font-size: 12px;
    }
  `,
  empty: css`
    display: grid;
    min-height: 280px;
    place-items: center;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    background: ${token.colorBgContainer};
  `,
}));
