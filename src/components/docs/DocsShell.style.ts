"use client";

import { createStyles } from "antd-style";

export const useDocsShellStyles = createStyles(({ token, css }) => ({
  shell: css`
    min-height: 100vh;
    background: ${token.colorBgContainer};
    color: ${token.colorText};
  `,
  header: css`
    position: sticky;
    z-index: 20;
    top: 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    background: color-mix(in srgb, ${token.colorBgContainer} 96%, transparent);
    backdrop-filter: blur(16px);
  `,
  headerInner: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 58px;
    padding: 0 28px;

    @media (max-width: 720px) {
      padding: 0 18px;
    }
  `,
  brandCluster: css`
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 13px;
  `,
  brand: css`
    display: inline-flex;
    width: 132px;
    flex: none;

    img {
      width: 100%;
      height: auto;
    }
  `,
  brandDivider: css`
    width: 1px;
    height: 21px;
    background: ${token.colorBorder};
  `,
  siteTitle: css`
    overflow: hidden;
    color: ${token.colorText};
    font-size: 16px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  headerActions: css`
    display: flex;
    align-items: center;
    gap: 6px;

    .ant-btn {
      color: ${token.colorTextSecondary};
    }

    @media (max-width: 520px) {
      .ant-btn > span:not(.ant-btn-icon) {
        display: none;
      }
    }
  `,
  backLink: css`
    flex: none;
    padding: 7px 10px;
    border-radius: ${token.borderRadius}px;
    color: ${token.colorTextSecondary};
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;

    &:hover,
    &:focus-visible {
      background: ${token.colorFillTertiary};
      color: ${token.colorText};
    }
  `,
  accountLink: css`
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    padding: 5px 9px;
    border-radius: ${token.borderRadius}px;
    color: ${token.colorText};
    font-size: 13px;
    text-decoration: none;

    &:hover,
    &:focus-visible {
      background: ${token.colorFillTertiary};
      color: ${token.colorText};
    }
  `,
  accountIcon: css`
    display: inline-flex;
    width: 28px;
    height: 28px;
    flex: none;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimaryText};
    font-size: 14px;
  `,
  accountIdentity: css`
    display: grid;
    min-width: 0;
    line-height: 1.2;

    > span {
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: ${token.colorTextTertiary};
      font-size: 10px;
    }

    @media (max-width: 620px) {
      display: none;
    }
  `,
  subHeader: css`
    display: flex;
    align-items: center;
    height: 42px;
    gap: 12px;
    padding: 0 28px;
    border-top: 1px solid ${token.colorBorderSecondary};
    color: ${token.colorTextSecondary};
    font-size: 13px;

    strong {
      color: ${token.colorText};
      font-weight: 650;
    }

    @media (max-width: 720px) {
      padding: 0 18px;
    }
  `,
  subHeaderDivider: css`
    width: 1px;
    height: 14px;
    background: ${token.colorBorder};
  `,
  layout: css`
    display: grid;
    min-height: calc(100vh - 101px);
    grid-template-columns: 248px minmax(0, 1fr);

    @media (max-width: 920px) {
      display: block;
      min-height: auto;
    }
  `,
  sidebar: css`
    position: sticky;
    top: 101px;
    align-self: start;
    height: calc(100vh - 101px);
    padding: 24px;
    overflow-y: auto;
    border-right: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};

    @media (max-width: 920px) {
      display: none;
    }
  `,
  navigationSearch: css`
    && {
      height: 36px;
      margin-bottom: 20px;
      border-color: ${token.colorBorderSecondary};
      border-radius: ${token.borderRadius}px;
      box-shadow: none;
    }
  `,
  navigationGroup: css`
    margin: 0 10px 7px;
    color: ${token.colorText};
    font-size: 13px;
    font-weight: 700;
  `,
  navigation: css`
    display: grid;
    gap: 18px;
  `,
  navigationSection: css`
    display: grid;
  `,
  navigationLinks: css`
    display: grid;
    gap: 2px;

    > a {
      padding: 8px 12px;
      border-radius: ${token.borderRadiusSM}px;
      color: ${token.colorTextSecondary};
      font-size: 13px;
      line-height: 1.5;
      text-decoration: none;
    }

    > a:hover,
    > a:focus-visible {
      background: ${token.colorFillQuaternary};
      color: ${token.colorText};
    }

    > a[data-active="true"] {
      background: ${token.colorFillSecondary};
      color: ${token.colorText};
      font-weight: 650;
    }
  `,
  noResults: css`
    margin: 8px 10px;
    color: ${token.colorTextTertiary};
    font-size: 13px;
  `,
  mobileNavigation: css`
    display: none;

    @media (max-width: 920px) {
      display: block;
      width: min(100% - 36px, 820px);
      margin: 18px auto 0;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadiusLG}px;
      background: ${token.colorBgContainer};

      summary {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 11px 14px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
        list-style: none;
      }

      summary::-webkit-details-marker {
        display: none;
      }

      > div {
        padding: 4px 12px 12px;
      }
    }
  `,
  content: css`
    min-width: 0;
    padding: 30px clamp(28px, 4vw, 64px) 96px;

    [data-docs-article-layout] {
      display: grid;
      width: min(1160px, 100%);
      grid-template-columns: minmax(0, 920px) 160px;
      justify-content: center;
      gap: clamp(36px, 4vw, 56px);
      margin: 0 auto;
    }

    [data-docs-article-column],
    [data-docs-article] {
      min-width: 0;
    }

    [data-docs-article-toolbar] {
      display: flex;
      min-height: 34px;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 28px;

      .ant-btn {
        height: 32px;
        border-color: ${token.colorBorderSecondary};
        color: ${token.colorTextSecondary};
        box-shadow: none;
        font-size: 13px;
      }
    }

    [data-docs-breadcrumb] {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 8px;
      color: ${token.colorTextTertiary};
      font-size: 12px;

      > a,
      > span[aria-current="page"] {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      > a {
        color: ${token.colorTextSecondary};
        text-decoration: none;
      }

      > a:hover,
      > a:focus-visible {
        color: ${token.colorPrimary};
      }
    }

    [data-docs-eyebrow] {
      display: none;
    }

    [data-docs-lead] {
      max-width: 720px;
      margin: 0 0 24px;
      color: ${token.colorTextSecondary};
      font-size: 15px;
      line-height: 1.8;
    }

    [data-docs-toc] {
      position: sticky;
      top: 130px;
      align-self: start;
      max-height: calc(100vh - 160px);
      padding-left: 18px;
      overflow-y: auto;
      border-left: 1px solid ${token.colorBorderSecondary};

      > nav {
        display: grid;
        gap: 2px;

        > a {
          padding: 4px 0;
          color: ${token.colorTextSecondary};
          font-size: 12px;
          line-height: 1.55;
          text-decoration: none;
        }

        > a:hover,
        > a:focus-visible {
          color: ${token.colorPrimary};
        }
      }
    }

    [data-docs-pagination] {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-top: 72px;
      padding-top: 24px;
      border-top: 1px solid ${token.colorBorderSecondary};

      > a {
        display: grid;
        gap: 4px;
        padding: 14px 16px;
        border: 1px solid ${token.colorBorderSecondary};
        border-radius: ${token.borderRadiusLG}px;
        color: ${token.colorText};
        text-decoration: none;
      }

      > a:hover,
      > a:focus-visible {
        border-color: ${token.colorPrimaryBorder};
        background: ${token.colorPrimaryBg};
      }

      > a[data-direction="next"] {
        text-align: right;
      }

      span {
        color: ${token.colorTextTertiary};
        font-size: 12px;
      }

      strong {
        font-size: 14px;
      }
    }

    [data-style-scope="docs-prose"] {
      h1 {
        margin: 0 0 34px;
        padding-bottom: 22px;
        border-bottom: 1px solid ${token.colorBorderSecondary};
        font-size: clamp(30px, 3vw, 36px);
        line-height: 1.24;
        letter-spacing: -0.02em;
      }

      h2 {
        scroll-margin-top: 130px;
        margin: 42px 0 14px;
        font-size: 21px;
        line-height: 1.4;
      }

      h3 {
        scroll-margin-top: 130px;
        margin: 28px 0 10px;
        font-size: 17px;
      }

      p,
      li {
        color: ${token.colorTextSecondary};
        font-size: 14px;
        line-height: 1.85;
      }

      ul,
      ol {
        padding-left: 22px;
      }

      blockquote {
        margin: 22px 0 30px;
        padding: 16px 18px;
        border: 1px solid ${token.colorBorderSecondary};
        border-radius: ${token.borderRadiusLG}px;
        background: ${token.colorFillQuaternary};

        p {
          margin: 0 0 8px;
        }

        p:last-child {
          margin-bottom: 0;
        }

        strong {
          color: ${token.colorText};
        }
      }

      code {
        padding: 0.16em 0.4em;
        border-radius: 4px;
        background: ${token.colorFillTertiary};
        color: ${token.colorText};
        font-size: 0.9em;
        overflow-wrap: anywhere;
      }

      a {
        color: ${token.colorPrimary};
      }

      [data-docs-task-grid] {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin-top: 18px;
      }

      [data-docs-task-card] {
        display: grid;
        min-width: 0;
        gap: 7px;
        padding: 18px;
        border: 1px solid ${token.colorBorderSecondary};
        border-radius: ${token.borderRadiusLG}px;
        color: ${token.colorText};
        text-decoration: none;
      }

      [data-docs-task-card]:hover,
      [data-docs-task-card]:focus-visible {
        border-color: ${token.colorPrimaryBorder};
        background: ${token.colorPrimaryBg};
      }

      [data-docs-task-card] > strong {
        font-size: 15px;
      }

      [data-docs-task-card] > span {
        color: ${token.colorTextSecondary};
        font-size: 13px;
        line-height: 1.65;
      }

      table {
        width: 100%;
        border-spacing: 0;
        border-collapse: collapse;
        margin-top: 16px;
        border: 1px solid ${token.colorBorderSecondary};
        font-size: 13px;
      }

      th,
      td {
        padding: 10px 12px;
        border-right: 1px solid ${token.colorBorderSecondary};
        border-bottom: 1px solid ${token.colorBorderSecondary};
        text-align: left;
        vertical-align: top;
      }

      tr > :last-child {
        border-right: 0;
      }

      tbody tr:last-child td {
        border-bottom: 0;
      }

      th {
        background: ${token.colorFillQuaternary};
        color: ${token.colorTextSecondary};
        font-size: 12px;
        font-weight: 650;
      }
    }

    @media (max-width: 1180px) {
      [data-docs-article-layout] {
        display: block;
        max-width: 820px;
      }

      [data-docs-toc] {
        display: none;
      }
    }

    @media (max-width: 920px) {
      padding-top: 28px;
    }

    @media (max-width: 640px) {
      padding: 24px 18px 72px;

      [data-docs-article-toolbar] {
        align-items: flex-start;
      }

      [data-docs-article-toolbar] .ant-btn > span:not(.ant-btn-icon) {
        display: none;
      }

      [data-docs-pagination] {
        grid-template-columns: 1fr;
      }

      [data-style-scope="docs-prose"] {
        h1 {
          margin-bottom: 28px;
        }

        table {
          display: block;
          overflow-x: auto;
          white-space: nowrap;
        }

        [data-docs-task-grid] {
          grid-template-columns: 1fr;
        }
      }
    }
  `,
}));
