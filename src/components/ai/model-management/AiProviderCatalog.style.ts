"use client";

import { createStyles } from "antd-style";

export const useAiProviderCatalogStyles = createStyles(({ token, css }) => ({
  providerList: css`
    display: grid;
    min-width: 0;
    gap: 14px;
  `,
  providerCard: css`
    overflow: hidden;
    min-width: 0;
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
    min-width: 0;
  `,
  modelTableHeader: css`
    display: grid;
    min-height: 38px;
    grid-template-columns:
      minmax(220px, 1.2fr) minmax(240px, 1fr)
      100px minmax(240px, auto);
    align-items: center;
    padding: 0 16px;
    gap: 16px;
    background: ${token.colorFillQuaternary};
    color: ${token.colorTextSecondary};
    font-size: 12px;

    @media (max-width: 1100px) {
      display: none;
    }
  `,
  modelRow: css`
    display: grid;
    min-width: 0;
    min-height: 66px;
    grid-template-columns:
      minmax(220px, 1.2fr) minmax(240px, 1fr)
      100px minmax(240px, auto);
    align-items: center;
    padding: 10px 16px;
    gap: 16px;
    border-top: 1px solid ${token.colorBorderSecondary};

    &:first-of-type {
      border-top: 0;
    }

    @media (max-width: 1100px) {
      grid-template-columns: minmax(0, 1fr);
      gap: 9px;
    }
  `,
  modelIdentity: css`
    display: grid;
    min-width: 0;
    gap: 2px;

    h4 {
      margin: 0;
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
  modelDetails: css`
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
    justify-content: flex-start;
    flex-wrap: wrap;

    .ant-btn {
      height: 28px;
      padding-inline: 7px;
    }

    @media (max-width: 1100px) {
      justify-content: flex-start;
    }
  `,
}));
