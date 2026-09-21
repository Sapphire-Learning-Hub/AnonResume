"use client";

import { GlobalOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { createStyles } from "antd-style";
import Image from "next/image";
import type { ReactNode } from "react";

import { AnnouncementBanner } from "@/components/announcements/AnnouncementBanner";
import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { useI18n } from "@/i18n/I18nProvider";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";

const useStyles = createStyles(({ token, css }) => ({
  experience: css`
    display: grid;
    width: 100%;
    min-height: 100vh;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 24px;
    padding: 30px clamp(28px, 4vw, 64px) 24px;

    @media (max-width: 520px) {
      padding: 20px 18px 18px;
    }
  `,
  announcementSlot: css`
    width: min(1080px, 100%);
    margin: 0 auto;
  `,
  topBar: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
  `,
  brandLogo: css`
    display: block;
    width: 190px;
    height: auto;
    object-fit: contain;
  `,
  localeButton: css`
    && {
      height: 38px;
      padding-inline: 14px;
      border-color: transparent;
      border-radius: 12px;
      color: ${token.colorTextSecondary};
      background: color-mix(
        in srgb,
        ${token.colorBgContainer} 72%,
        transparent
      );
      box-shadow: none;
    }

    &&:hover {
      border-color: ${token.colorBorderSecondary};
      color: ${token.colorText};
      background: ${token.colorBgContainer};
    }
  `,
  content: css`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(400px, 460px);
    align-items: center;
    gap: clamp(48px, 8vw, 112px);
    width: min(1080px, 100%);
    margin: 0 auto;

    @media (max-width: 900px) {
      grid-template-columns: minmax(0, 460px);
      justify-content: center;
    }
  `,
  showcase: css`
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    padding: 24px;

    &::before {
      position: absolute;
      width: 78%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: ${token.colorPrimaryBg};
      content: "";
      filter: blur(54px);
      opacity: 0.72;
    }

    @media (max-width: 900px) {
      display: none;
    }
  `,
  showcaseArtwork: css`
    position: relative;
    z-index: 1;
    display: block;
    width: min(500px, 100%);
    height: auto;
    filter: drop-shadow(
      0 28px 42px color-mix(in srgb, ${token.colorText} 12%, transparent)
    );
  `,
  shell: css`
    display: flex;
    min-height: 580px;
    flex-direction: column;
    width: 100%;
    padding: 50px 42px 40px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 26px;
    background: color-mix(in srgb, ${token.colorBgContainer} 94%, transparent);
    box-shadow: 0 24px 64px
      color-mix(in srgb, ${token.colorText} 10%, transparent);
    backdrop-filter: blur(20px);

    @media (max-width: 520px) {
      min-height: 0;
      padding: 32px 24px 28px;
      border-radius: 20px;
    }
  `,
  footer: css`
    margin: 0;
    color: ${token.colorTextTertiary};
    font-size: 12px;
    line-height: 1.6;
    text-align: center;
  `,
}));

export function AuthExperienceShell({
  announcements = [],
  children,
}: {
  announcements?: readonly LocalizedAnnouncement[];
  children: ReactNode;
}) {
  const { styles } = useStyles();
  const { locale, setLocale, t } = useI18n();

  return (
    <section className={styles.experience}>
      <header className={styles.topBar}>
        <AnonResumeLogo
          className={styles.brandLogo}
          loading="eager"
          variant="lockup"
        />
        <Button
          className={styles.localeButton}
          icon={<GlobalOutlined />}
          onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}
        >
          {locale === "zh-CN" ? "English" : "简体中文"}
        </Button>
      </header>

      <div className={styles.announcementSlot}>
        {announcements.length > 0 ? (
          <AnnouncementBanner announcements={announcements} />
        ) : null}
      </div>

      <div className={styles.content}>
        <div className={styles.showcase} aria-hidden="true">
          <Image
            alt=""
            className={styles.showcaseArtwork}
            height={800}
            preload
            src="/auth/document-review.svg"
            unoptimized
            width={845}
          />
        </div>

        <section className={styles.shell}>{children}</section>
      </div>

      <p className={styles.footer}>{t("auth.footer")}</p>
    </section>
  );
}
