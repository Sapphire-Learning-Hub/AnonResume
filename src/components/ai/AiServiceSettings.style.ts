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
  description: css`
    margin: 3px 0 0;
    color: ${token.colorTextSecondary};
    font-size: 13px;
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
  providerList: css`
    display: grid;
    gap: 14px;
  `,
  providerCard: css`
    overflow: hidden;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 6px;
    background: ${token.colorBgContainer};
  `,
  providerHeader: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    min-height: 78px;
    padding: 14px 16px;
    gap: 20px;
    border-bottom: 1px solid ${token.colorBorderSecondary};

    @media (max-width: 900px) {
      align-items: flex-start;
      flex-direction: column;
    }
  `,
  providerIdentity: css`
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 12px;

    p,
    span {
      margin: 0;
      color: ${token.colorTextSecondary};
      font-size: 12px;
      line-height: 1.5;
    }

    p {
      overflow: hidden;
      max-width: 680px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  providerIcon: css`
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    place-items: center;
    border-radius: 8px;
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimary};
    font-size: 18px;
  `,
  providerTitleRow: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;

    h3 {
      margin: 0;
      color: ${token.colorText};
      font-size: 15px;
      font-weight: 600;
    }

    .ant-tag {
      margin: 0;
    }
  `,
  providerActions: css`
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;

    .ant-btn {
      height: 30px;
    }
  `,
  modelEmpty: css`
    display: flex;
    min-height: 92px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: ${token.colorTextTertiary};
    font-size: 13px;
  `,
  modelTable: css`
    display: grid;
  `,
  modelTableHeader: css`
    display: grid;
    min-height: 38px;
    grid-template-columns:
      minmax(220px, 1.2fr) minmax(240px, 1fr)
      100px minmax(300px, auto);
    align-items: center;
    padding: 0 16px;
    gap: 16px;
    background: ${token.colorFillQuaternary};
    color: ${token.colorTextSecondary};
    font-size: 12px;

    @media (max-width: 980px) {
      display: none;
    }
  `,
  modelRow: css`
    display: grid;
    min-height: 66px;
    grid-template-columns:
      minmax(220px, 1.2fr) minmax(240px, 1fr)
      100px minmax(300px, auto);
    align-items: center;
    padding: 10px 16px;
    gap: 16px;
    border-top: 1px solid ${token.colorBorderSecondary};

    &:first-of-type {
      border-top: 0;
    }

    @media (max-width: 980px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 9px;
    }
  `,
  modelIdentity: css`
    display: grid;
    min-width: 0;
    gap: 2px;

    strong {
      color: ${token.colorText};
      font-size: 13px;
      font-weight: 600;
    }

    span {
      overflow: hidden;
      color: ${token.colorTextTertiary};
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  capabilities: css`
    display: flex;
    min-width: 0;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;

    .ant-tag {
      margin: 0;
      font-size: 11px;
    }
  `,
  modelActions: css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;

    .ant-btn {
      height: 28px;
      padding-inline: 7px;
    }

    @media (max-width: 980px) {
      justify-content: flex-start;
    }
  `,
}));
