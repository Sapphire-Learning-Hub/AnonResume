"use client";

import { createStyles } from "antd-style";

export const useMarketingHomeStyles = createStyles(({ token, css }) => ({
  shell: css`
    min-height: 100vh;
    overflow: hidden;
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
    position: sticky;
    top: 0;
    z-index: 100;
    border-bottom: 1px solid
      color-mix(in srgb, ${token.colorBorderSecondary} 74%, transparent);
    background: color-mix(in srgb, ${token.colorBgContainer} 90%, transparent);
    backdrop-filter: blur(18px);
  `,
  nav: css`
    display: grid;
    width: min(1180px, calc(100% - 40px));
    min-height: 72px;
    grid-template-columns: auto 1fr auto;
    gap: 36px;
    align-items: center;
    margin: 0 auto;

    @media (max-width: 980px) {
      grid-template-columns: auto 1fr;
      gap: 20px;
    }

    @media (max-width: 640px) {
      width: min(100% - 28px, 1180px);
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
  desktopOnly: css`
    display: inline-flex;

    @media (max-width: 640px) {
      display: none;
    }
  `,
  main: css`
    display: block;
  `,
  hero: css`
    position: relative;
    padding: clamp(72px, 9vw, 124px) 20px 84px;
    background: color-mix(in srgb, ${token.colorPrimaryBg} 54%, ${token.colorBgContainer});

    @media (max-width: 640px) {
      padding: 60px 16px 70px;
    }
  `,
  heroInner: css`
    display: grid;
    width: min(1180px, 100%);
    grid-template-columns: minmax(0, 0.9fr) minmax(520px, 1.1fr);
    gap: clamp(44px, 6vw, 86px);
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
  eyebrow: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 24px;
    padding: 8px 12px;
    border: 1px solid ${token.colorPrimaryBorder};
    border-radius: 999px;
    background: color-mix(in srgb, ${token.colorBgContainer} 80%, transparent);
    color: ${token.colorPrimaryText};
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
  `,
  heroTitle: css`
    max-width: 620px;
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: clamp(48px, 6vw, 78px);
    font-weight: 820;
    letter-spacing: -0.065em;
    line-height: 1.02;
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
    padding: clamp(76px, 9vw, 118px) 20px;
    scroll-margin-top: 72px;
  `,
  sectionAlt: css`
    background: ${token.colorBgLayout};
  `,
  sectionInner: css`
    width: min(1180px, 100%);
    margin: 0 auto;
  `,
  sectionIntro: css`
    display: grid;
    max-width: 760px;
    gap: 12px;
    margin-bottom: 44px;
  `,
  sectionKicker: css`
    margin: 0;
    color: ${token.colorPrimary};
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  `,
  sectionTitle: css`
    margin: 0;
    color: ${token.colorTextHeading};
    font-size: clamp(34px, 4vw, 54px);
    letter-spacing: -0.045em;
    line-height: 1.12;
  `,
  sectionLead: css`
    max-width: 700px;
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: 17px;
    line-height: 1.75;
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
    grid-template-columns: minmax(0, 0.78fr) minmax(560px, 1.22fr);
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
    }
  `,
  templateGrid: css`
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;

    @media (max-width: 760px) {
      grid-template-columns: 1fr;
    }
  `,
  templateCard: css`
    margin: 0;

    picture {
      display: block;
      aspect-ratio: 1.282 / 1;
      overflow: hidden;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: 18px;
      background: ${token.colorFillQuaternary};
      box-shadow: ${token.boxShadowTertiary};
    }

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 420ms ${token.motionEaseOut};
    }

    &:hover img {
      transform: scale(1.025);
    }

    figcaption {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 4px 0;
    }

    strong {
      color: ${token.colorTextHeading};
      font-size: 16px;
    }

    span {
      color: ${token.colorTextSecondary};
      font-size: 13px;
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
    width: min(1180px, 100%);
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
      max-width: 720px;
      margin: 0;
      color: ${token.colorTextHeading};
      font-size: clamp(32px, 4vw, 52px);
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
    width: min(1180px, 100%);
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
