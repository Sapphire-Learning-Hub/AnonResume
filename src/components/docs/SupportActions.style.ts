"use client";

import { createStyles } from "antd-style";

export const useSupportActionsStyles = createStyles(({ token, css }) => ({
  actions: css`
    display: grid;
    gap: 14px;
    margin-top: 30px;
    padding: 20px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadiusLG}px;
    background: ${token.colorFillQuaternary};
  `,
  links: css`
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;

    > a {
      display: inline-flex;
      min-height: 36px;
      align-items: center;
      gap: 7px;
      padding: 7px 14px;
      border: 1px solid ${token.colorBorder};
      border-radius: ${token.borderRadius}px;
      color: ${token.colorText};
      font-size: 13px;
      font-weight: 650;
      text-decoration: none;
    }

    > a:hover,
    > a:focus-visible {
      border-color: ${token.colorPrimaryBorder};
      background: ${token.colorPrimaryBg};
      color: ${token.colorPrimary};
    }

    > a[data-primary="true"] {
      border-color: ${token.colorPrimary};
      background: ${token.colorPrimary};
      color: ${token.colorTextLightSolid};
    }
  `,
  notice: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 13px;
    line-height: 1.7;
  `,
}));
