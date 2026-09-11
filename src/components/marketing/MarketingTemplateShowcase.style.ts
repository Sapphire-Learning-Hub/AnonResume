"use client";

import { createStyles } from "antd-style";

export const useMarketingTemplateShowcaseStyles = createStyles(
  ({ token, css }) => ({
    scrollTrack: css`
      position: relative;
    `,
    stickyFrame: css`
      position: sticky;
      top: 88px;

      @media (max-width: 900px), (prefers-reduced-motion: reduce) {
        position: relative;
        top: auto;
      }
    `,
    scrollSpacer: css`
      height: var(--template-scroll-distance);
      pointer-events: none;

      @media (max-width: 900px), (prefers-reduced-motion: reduce) {
        display: none;
      }
    `,
    sectionIntro: css`
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
      gap: 12px clamp(40px, 7vw, 100px);
      align-items: end;
      margin-bottom: 42px;

      > :first-child {
        grid-column: 1 / -1;
      }

      @media (max-width: 820px) {
        grid-template-columns: 1fr;

        > * {
          grid-column: 1;
        }
      }
    `,
    sectionTitle: css`
      margin: 0;
      color: ${token.colorTextHeading};
      font-size: clamp(32px, 3.7vw, 46px);
      letter-spacing: -0.04em;
      line-height: 1.16;
    `,
    sectionLead: css`
      margin: 0;
      color: ${token.colorTextSecondary};
      font-size: 16px;
      line-height: 1.8;
    `,
    showcase: css`
      display: grid;
      height: clamp(520px, calc(100svh - 280px), 720px);
      grid-template-columns: minmax(250px, 0.72fr) minmax(0, 1.7fr);
      overflow: hidden;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: 28px;
      background: ${token.colorBgContainer};
      box-shadow: ${token.boxShadowTertiary};

      @media (max-width: 900px) {
        height: auto;
        min-height: auto;
        grid-template-columns: 1fr;
      }

      @media (prefers-reduced-motion: reduce) and (min-width: 901px) {
        height: 620px;
      }
    `,
    selectorPanel: css`
      position: relative;
      z-index: 2;
      display: flex;
      min-width: 0;
      flex-direction: column;
      justify-content: space-between;
      gap: 36px;
      padding: clamp(28px, 4vw, 52px);
      border-right: 1px solid ${token.colorBorderSecondary};
      background: color-mix(
        in srgb,
        ${token.colorBgContainer} 92%,
        ${token.colorPrimaryBg}
      );

      h3 {
        margin: 18px 0 10px;
        color: ${token.colorTextHeading};
        font-size: clamp(26px, 3vw, 38px);
        letter-spacing: -0.035em;
        line-height: 1.16;
      }

      p {
        margin: 0;
        color: ${token.colorTextSecondary};
        line-height: 1.75;
      }

      @media (max-width: 900px) {
        border-right: 0;
        border-bottom: 1px solid ${token.colorBorderSecondary};
      }
    `,
    liveBadge: css`
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: ${token.colorPrimary};
      font-size: 13px;
      font-weight: 700;

      svg {
        font-size: 14px;
      }
    `,
    templateSelector: css`
      display: grid;
      gap: 8px;

      button {
        display: grid;
        width: 100%;
        gap: 3px;
        padding: 13px 14px;
        border: 1px solid transparent;
        border-radius: 10px;
        background: transparent;
        color: ${token.colorText};
        cursor: pointer;
        font: inherit;
        text-align: left;
        transition:
          background ${token.motionDurationMid},
          border-color ${token.motionDurationMid},
          transform ${token.motionDurationMid};

        &:hover {
          background: ${token.colorFillQuaternary};
        }

        &:focus-visible {
          outline: 2px solid ${token.colorPrimaryBorder};
          outline-offset: 2px;
        }

        &[data-active="true"] {
          border-color: ${token.colorPrimaryBorder};
          background: ${token.colorPrimaryBg};
          color: ${token.colorPrimaryText};
          transform: translateX(4px);
        }

        span {
          font-weight: 700;
        }

        small {
          overflow: hidden;
          color: ${token.colorTextSecondary};
          font-size: 12px;
          line-height: 1.45;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      @media (max-width: 900px) {
        grid-template-columns: repeat(4, minmax(150px, 1fr));
        overflow-x: auto;

        button[data-active="true"] {
          transform: none;
        }
      }
    `,
    previewStage: css`
      position: relative;
      display: grid;
      min-width: 0;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      place-items: center;
      background:
        linear-gradient(
          135deg,
          color-mix(in srgb, ${token.colorPrimaryBg} 72%, ${token.colorBgLayout}),
          ${token.colorBgLayout} 48%,
          color-mix(in srgb, ${token.colorInfoBg} 56%, ${token.colorBgLayout})
        );

      @media (max-width: 900px) {
        height: auto;
        min-height: 620px;
      }

      @media (max-width: 560px) {
        min-height: 500px;
      }
    `,
    previewGlow: css`
      position: absolute;
      width: 520px;
      height: 520px;
      border-radius: 50%;
      background: color-mix(in srgb, ${token.colorPrimary} 17%, transparent);
      filter: blur(80px);
      pointer-events: none;
    `,
    previewViewport: css`
      position: relative;
      z-index: 1;
      width: 560px;
      height: min(690px, calc(100svh - 310px));
      overflow: hidden;

      @media (max-width: 560px) {
        width: 348px;
        height: 470px;
      }
    `,
    previewDocument: css`
      position: absolute;
      top: 8px;
      left: 50%;
      width: 210mm;
      margin-left: -105mm;
      transform: scale(0.6);
      transform-origin: top center;
      animation: marketing-template-enter 420ms cubic-bezier(0.2, 0.75, 0.25, 1)
        both;

      @keyframes marketing-template-enter {
        from {
          opacity: 0;
          translate: 0 16px;
        }
        to {
          opacity: 1;
          translate: 0 0;
        }
      }

      [data-print-chrome="screen"] {
        display: none;
      }

      [data-resume-page="true"] {
        box-shadow: 0 28px 70px
          color-mix(in srgb, ${token.colorText} 20%, transparent);
      }

      @media (max-width: 560px) {
        transform: scale(0.42);
      }

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `,
  }),
);
