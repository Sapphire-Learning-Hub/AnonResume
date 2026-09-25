"use client";

import { createStyles } from "antd-style";

export const useResumeLinkDialogStyles = createStyles(({ token, css }) => ({
  layout: css`
    display: grid;
    grid-template-columns: 184px minmax(0, 1fr);
    min-height: 390px;
    margin: -8px -24px -20px;

    @media (max-width: 650px) {
      grid-template-columns: 1fr;
    }
  `,
  categories: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px 10px;
    border-right: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorFillQuaternary};

    @media (max-width: 650px) {
      flex-direction: row;
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
  `,
  category: css`
    && {
      justify-content: flex-start;
      width: 100%;
      height: 38px;
      padding: 0 10px;
      border: 0;
      border-radius: ${token.borderRadius}px;
      box-shadow: none;

      &[aria-pressed="true"] {
        color: ${token.colorPrimaryText};
        background: ${token.colorPrimaryBg};
      }

      @media (max-width: 650px) {
        width: max-content;
        flex: none;
      }
    }
  `,
  form: css`
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 16px 22px 20px;
  `,
  field: css`
    display: grid;
    gap: 7px;
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 600;
  `,
  target: css`
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 14px;
    min-height: 210px;
    padding: 18px 0;
  `,
  sectionList: css`
    display: grid;
    align-content: start;
    gap: 5px;
    max-height: 230px;
    overflow-y: auto;
  `,
  sectionButton: css`
    && {
      justify-content: flex-start;
      width: 100%;
      height: 36px;
      padding: 0 10px;
      border: 0;
      box-shadow: none;

      &[aria-pressed="true"] {
        color: ${token.colorPrimaryText};
        background: ${token.colorPrimaryBg};
      }
    }
  `,
  hint: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 12px;
  `,
  error: css`
    margin: 0;
    color: ${token.colorError};
    font-size: 12px;
    font-weight: 400;
  `,
  footer: css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 20px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  remove: css`
    && {
      margin-right: auto;
    }
  `,
}));
