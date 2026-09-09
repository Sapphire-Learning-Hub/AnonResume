"use client";

import { Button } from "antd";
import { createStyles } from "antd-style";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { useI18n } from "@/i18n/I18nProvider";

const useStyles = createStyles(({ token, css }) => ({
  shell: css`
    min-height: 100vh;
    padding: 32px;
    background:
      radial-gradient(
        circle at top,
        color-mix(in srgb, ${token.colorPrimary} 14%, transparent),
        transparent 38%
      ),
      ${token.colorBgLayout};
  `,
  frame: css`
    display: grid;
    gap: 24px;
    max-width: 1240px;
    margin: 0 auto;
  `,
  hero: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 24px 28px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 24px;
    background: color-mix(in srgb, ${token.colorBgContainer} 90%, transparent);
    box-shadow: ${token.boxShadowTertiary};
  `,
  heading: css`
    margin: 0;
    line-height: 0;
    margin-bottom: 12px;
  `,
  brandLogo: css`
    display: block;
    width: clamp(240px, 30vw, 340px);
    height: auto;
    object-fit: contain;
  `,
  eyebrow: css`
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: ${token.colorPrimary};
  `,
  lead: css`
    margin: 0;
    max-width: 640px;
    color: ${token.colorTextSecondary};
    line-height: 1.7;
  `,
}));

export default function HomePage() {
  const { styles } = useStyles();
  const { locale, t } = useI18n();
  const document = createDefaultResumeDocument(locale);

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{t("home.eyebrow")}</p>
            <h1 className={styles.heading}>
              <AnonResumeLogo
                className={styles.brandLogo}
                loading="eager"
                variant="lockup"
              />
            </h1>
            <p className={styles.lead}>{t("home.lead")}</p>
          </div>
          <Button type="primary" size="large" href="/sign-in">
            {t("common.signIn")}
          </Button>
        </section>

        <ResumeRenderer document={document} mode="view" />
      </div>
    </main>
  );
}
