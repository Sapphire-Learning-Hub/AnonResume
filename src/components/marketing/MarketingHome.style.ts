"use client";

import { createStyles } from "antd-style";

export const useMarketingHomeStyles = createStyles(({ token, css }) => ({
  shell: css`
    min-height: 100vh;
    overflow: clip;
    background: ${token.colorBgContainer};
    color: ${token.colorText};

    @keyframes marketing-rise {
      from {
        opacity: 0;
        transform: translateY(18px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        scroll-behavior: auto !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `,
  skipLink: css`
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 1100;
    padding: 9px 14px;
    border-radius: ${token.borderRadius}px;
    background: ${token.colorPrimary};
    color: ${token.colorWhite};
    transform: translateY(-160%);

    &:focus {
      transform: translateY(0);
    }
  `,
  header: css`
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    z-index: 100;
    padding-inline: 20px;
    pointer-events: none;

    &[data-scrolled="true"] [data-marketing-navigation="true"] {
      width: min(780px, calc(100vw - 40px));
      min-height: 56px;
      gap: 22px;
      margin-top: 12px;
      padding: 6px 8px 6px 14px;
      border: 1px solid
        color-mix(in srgb, ${token.colorBorderSecondary} 80%, transparent);
      border-radius: 18px;
      background: color-mix(in srgb, ${token.colorBgElevated} 88%, transparent);
      box-shadow: 0 16px 44px color-mix(in srgb, ${token.colorText} 14%, transparent);
      backdrop-filter: blur(20px) saturate(1.35);
    }

    &[data-scrolled="true"] [data-marketing-brand="true"] img {
      width: 132px;
    }

    &[data-scrolled="true"] [data-marketing-links="true"] {
      gap: 18px;
    }

    @media (max-width: 640px) {
      padding-inline: 12px;

      &[data-scrolled="true"] [data-marketing-navigation="true"] {
        width: 100%;
      }
    }
  `,
  nav: css`
    box-sizing: border-box;
    display: grid;
    width: min(1320px, 100%);
    min-height: 80px;
    grid-template-columns: auto 1fr auto;
    gap: 36px;
    align-items: center;
    margin: 0 auto;
    border: 1px solid transparent;
    pointer-events: auto;
    transition:
      width 320ms ${token.motionEaseOut},
      min-height 320ms ${token.motionEaseOut},
      gap 320ms ${token.motionEaseOut},
      margin 320ms ${token.motionEaseOut},
      padding 320ms ${token.motionEaseOut},
      border-color 320ms ${token.motionEaseOut},
      border-radius 320ms ${token.motionEaseOut},
      background 320ms ${token.motionEaseOut},
      box-shadow 320ms ${token.motionEaseOut};

    @media (max-width: 980px) {
      grid-template-columns: auto 1fr;
      gap: 20px;
    }

    @media (max-width: 640px) {
      width: 100%;
      min-height: 64px;
    }
  `,
  brandLink: css`
    display: inline-flex;
    align-items: center;
  `,
  navLogo: css`
    display: block;
    width: 172px;
    height: auto;
    transition: width 320ms ${token.motionEaseOut};
  `,
  navLinks: css`
    display: flex;
    gap: 30px;
    align-items: center;
    justify-content: center;

    a {
      color: ${token.colorTextSecondary};
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: color ${token.motionDurationMid};
    }

    a:hover,
    a:focus-visible {
      color: ${token.colorPrimary};
    }

    @media (max-width: 980px) {
      display: none;
    }
  `,
  navActions: css`
    display: flex;
    gap: 10px;
    align-items: center;

    @media (max-width: 980px) {
      justify-self: end;
    }
  `,
  main: css`
    display: block;
  `,
  hero: css`
    position: relative;
    padding: clamp(128px, 12vw, 174px) 20px 92px;
    background:
      radial-gradient(
        circle at 72% 24%,
        color-mix(in srgb, ${token.colorInfoBg} 72%, transparent),
        transparent 36%
      ),
      radial-gradient(
        circle at 18% 12%,
        color-mix(in srgb, ${token.colorPrimaryBg} 86%, transparent),
        transparent 34%
      ),
      ${token.colorBgContainer};

    @media (max-width: 640px) {
      padding: 106px 16px 72px;
    }
  `,
  heroInner: css`
    display: grid;
    width: min(1320px, 100%);
    grid-template-columns: minmax(0, 0.98fr) minmax(560px, 1.02fr);
    gap: clamp(42px, 5vw, 72px);
    align-items: center;
    margin: 0 auto;

    @media (max-width: 980px) {
      grid-template-columns: 1fr;
    }
  `,
  heroCopy: css`
    position: relative;
    z-index: 2;
    animation: marketing-rise 620ms ${token.motionEaseOut} both;
  `,
  heroTitle: css`
    max-width: 620px;
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: clamp(44px, 4.8vw, 62px);
    font-weight: 820;
    letter-spacing: -0.055em;
    line-height: 1.06;
  `,
  heroAccent: css`
    color: ${token.colorPrimary};
  `,
  heroLead: css`
    max-width: 590px;
    margin: 28px 0 0;
    color: ${token.colorTextSecondary};
    font-size: clamp(17px, 1.55vw, 20px);
    line-height: 1.8;
  `,
  heroActions: css`
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 34px;
  `,
  primaryAction: css`
    && {
      min-height: 48px;
      padding-inline: 24px;
      border-radius: ${token.borderRadius}px;
      font-weight: 700;
      box-shadow: 0 12px 30px
        color-mix(in srgb, ${token.colorPrimary} 22%, transparent);
    }
  `,
  secondaryAction: css`
    && {
      min-height: 48px;
      padding-inline: 24px;
      border-radius: ${token.borderRadius}px;
      background: color-mix(in srgb, ${token.colorBgContainer} 88%, transparent);
      font-weight: 700;
    }
  `,
  heroProof: css`
    display: flex;
    flex-wrap: wrap;
    gap: 10px 20px;
    margin-top: 34px;
    color: ${token.colorTextSecondary};
    font-size: 13px;

    span {
      display: inline-flex;
      gap: 7px;
      align-items: center;
    }

    svg {
      color: ${token.colorSuccess};
    }
  `,
  heroVisual: css`
    position: relative;
    animation: marketing-rise 720ms 100ms ${token.motionEaseOut} both;
  `,
  screenshotFrame: css`
    position: relative;
    padding: 10px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, ${token.colorBorder} 84%, transparent);
    border-radius: 24px;
    background: ${token.colorBgElevated};
    box-shadow: 0 34px 80px color-mix(in srgb, ${token.colorText} 18%, transparent);

    picture {
      display: block;
      overflow: hidden;
      border-radius: 16px;
    }

    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 16 / 9;
      object-fit: contain;
    }
  `,
  floatingNote: css`
    position: absolute;
    right: -12px;
    bottom: -28px;
    display: grid;
    max-width: 250px;
    grid-template-columns: auto 1fr;
    gap: 10px;
    align-items: center;
    padding: 14px 16px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 16px;
    background: ${token.colorBgElevated};
    box-shadow: ${token.boxShadowSecondary};

    svg {
      color: ${token.colorPrimary};
      font-size: 20px;
    }

    strong,
    small {
      display: block;
    }

    small {
      margin-top: 2px;
      color: ${token.colorTextSecondary};
    }

    @media (max-width: 640px) {
      right: 10px;
      bottom: -38px;
      max-width: calc(100% - 20px);
    }
  `,
  section: css`
    padding: clamp(72px, 8vw, 108px) 20px;
    scroll-margin-top: 86px;
  `,
  sectionAlt: css`
    background: ${token.colorBgLayout};
  `,
  sectionInner: css`
    width: min(1320px, 100%);
    margin: 0 auto;
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
  featureGrid: css`
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 18px;
  `,
  featureCard: css`
    grid-column: span 4;
    min-height: 240px;
    padding: 26px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 22px;
    background: ${token.colorBgContainer};
    transition:
      transform ${token.motionDurationMid},
      border-color ${token.motionDurationMid},
      box-shadow ${token.motionDurationMid};

    &:hover {
      border-color: ${token.colorPrimaryBorder};
      box-shadow: ${token.boxShadowTertiary};
      transform: translateY(-4px);
    }

    &[data-wide="true"] {
      grid-column: span 8;
    }

    h3 {
      margin: 22px 0 10px;
      color: ${token.colorTextHeading};
      font-size: 21px;
    }

    p {
      margin: 0;
      color: ${token.colorTextSecondary};
      line-height: 1.75;
    }

    @media (max-width: 860px) {
      grid-column: span 6;

      &[data-wide="true"] {
        grid-column: span 6;
      }
    }

    @media (max-width: 580px) {
      grid-column: 1 / -1;
      min-height: auto;

      &[data-wide="true"] {
        grid-column: 1 / -1;
      }
    }
  `,
  featureIcon: css`
    display: grid;
    width: 46px;
    height: 46px;
    place-items: center;
    border-radius: 14px;
    background: ${token.colorPrimaryBg};
    color: ${token.colorPrimary};
    font-size: 21px;
  `,
  featureTags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;

    span {
      padding: 5px 9px;
      border-radius: 8px;
      background: ${token.colorFillQuaternary};
      color: ${token.colorTextSecondary};
      font-size: 12px;
      font-weight: 600;
    }
  `,
  showcase: css`
    display: grid;
    grid-template-columns: minmax(0, 0.72fr) minmax(600px, 1.28fr);
    gap: clamp(42px, 7vw, 92px);
    align-items: center;

    @media (max-width: 980px) {
      grid-template-columns: 1fr;
    }
  `,
  showcaseList: css`
    display: grid;
    gap: 18px;
    margin: 30px 0 0;
    padding: 0;
    list-style: none;

    li {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 12px;
      align-items: start;
    }

    svg {
      margin-top: 3px;
      color: ${token.colorPrimary};
    }

    strong,
    span {
      display: block;
    }

    span {
      margin-top: 4px;
      color: ${token.colorTextSecondary};
      line-height: 1.65;
    }
  `,
  showcaseImage: css`
    padding: 10px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 24px;
    background: color-mix(in srgb, ${token.colorText} 88%, ${token.colorBgContainer});
    box-shadow: 0 26px 70px color-mix(in srgb, ${token.colorText} 16%, transparent);

    picture {
      display: block;
      overflow: hidden;
      border-radius: 16px;
    }

    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 16 / 9;
      object-fit: contain;
    }
  `,
  templateLoading: css`
    display: grid;
    min-height: 620px;
    place-items: center;
    gap: 14px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 28px;
    background: ${token.colorBgContainer};
    color: ${token.colorTextSecondary};

    span {
      width: 34px;
      height: 34px;
      border: 3px solid ${token.colorPrimaryBg};
      border-top-color: ${token.colorPrimary};
      border-radius: 50%;
      animation: marketing-spin 800ms linear infinite;
    }

    @keyframes marketing-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
  typeGrid: css`
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;

    @media (max-width: 860px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 520px) {
      grid-template-columns: 1fr;
    }
  `,
  typeCard: css`
    display: grid;
    min-height: 220px;
    align-content: space-between;
    padding: 24px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 18px;
    background: ${token.colorBgContainer};

    p {
      margin: 0;
      color: ${token.colorTextHeading};
      font-size: 42px;
      line-height: 1.05;
    }

    strong,
    span {
      display: block;
    }

    span {
      margin-top: 5px;
      color: ${token.colorTextSecondary};
      font-size: 13px;
    }
  `,
  fontSans: css`
    font-family: var(--font-manrope), var(--font-noto-sans-sc), sans-serif;
  `,
  fontSerif: css`
    font-family: var(--font-source-serif-4), var(--font-noto-serif-sc), serif;
  `,
  fontMono: css`
    font-family: var(--font-noto-sans-mono), monospace;
  `,
  fontDisplay: css`
    font-family: var(--font-playfair-display), var(--font-noto-serif-sc), serif;
  `,
  steps: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    counter-reset: marketing-step;

    @media (max-width: 760px) {
      grid-template-columns: 1fr;
    }
  `,
  step: css`
    position: relative;
    padding: 28px;
    border-top: 2px solid ${token.colorPrimary};
    background: ${token.colorBgContainer};
    counter-increment: marketing-step;

    &::before {
      color: ${token.colorPrimary};
      content: "0" counter(marketing-step);
      font-family: var(--font-noto-sans-mono), monospace;
      font-size: 13px;
      font-weight: 700;
    }

    h3 {
      margin: 34px 0 10px;
      color: ${token.colorTextHeading};
      font-size: 22px;
    }

    p {
      margin: 0;
      color: ${token.colorTextSecondary};
      line-height: 1.7;
    }
  `,
  cta: css`
    padding: 20px 20px 100px;
    background: ${token.colorBgLayout};
  `,
  ctaInner: css`
    display: grid;
    width: min(1320px, 100%);
    grid-template-columns: 1fr auto;
    gap: 32px;
    align-items: center;
    margin: 0 auto;
    padding: clamp(36px, 6vw, 68px);
    border: 1px solid ${token.colorPrimaryBorder};
    border-radius: 28px;
    background: ${token.colorPrimaryBg};

    @media (max-width: 760px) {
      grid-template-columns: 1fr;
    }

    h2 {
      max-width: 840px;
      margin: 0;
      color: ${token.colorTextHeading};
      font-size: clamp(29px, 3.25vw, 42px);
      letter-spacing: -0.045em;
      line-height: 1.15;
    }

    p {
      margin: 14px 0 0;
      color: ${token.colorTextSecondary};
      font-size: 16px;
      line-height: 1.7;
    }
  `,
  footer: css`
    padding: 40px 20px;
    border-top: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
  `,
  footerInner: css`
    display: flex;
    width: min(1320px, 100%);
    gap: 28px;
    align-items: center;
    justify-content: space-between;
    margin: 0 auto;
    color: ${token.colorTextSecondary};
    font-size: 13px;

    @media (max-width: 700px) {
      align-items: flex-start;
      flex-direction: column;
    }
  `,
  footerLinks: css`
    display: flex;
    flex-wrap: wrap;
    gap: 18px;

    a {
      color: inherit;
      text-decoration: none;
    }

    a:hover,
    a:focus-visible {
      color: ${token.colorPrimary};
    }
  `,
  footerLogo: css`
    display: block;
    width: 148px;
    height: auto;
  `,
}));
