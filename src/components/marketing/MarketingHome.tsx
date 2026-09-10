"use client";

import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CloudDownloadOutlined,
  CodeOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  ImportOutlined,
  LayoutOutlined,
  SafetyCertificateOutlined,
  SkinOutlined,
} from "@ant-design/icons";
import { Button } from "antd";
import Image from "next/image";
import type { ReactNode } from "react";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";

import { useMarketingHomeStyles } from "./MarketingHome.style";

type Feature = {
  description: MessageKey;
  icon: ReactNode;
  tags?: MessageKey[];
  title: MessageKey;
  wide?: boolean;
};

const features: Feature[] = [
  {
    description: "home.feature.editor.description",
    icon: <LayoutOutlined />,
    tags: [
      "home.feature.editor.tag.structure",
      "home.feature.editor.tag.pagination",
      "home.feature.editor.tag.renderer",
    ],
    title: "home.feature.editor.title",
    wide: true,
  },
  {
    description: "home.feature.import.description",
    icon: <ImportOutlined />,
    title: "home.feature.import.title",
  },
  {
    description: "home.feature.design.description",
    icon: <SkinOutlined />,
    title: "home.feature.design.title",
  },
  {
    description: "home.feature.history.description",
    icon: <HistoryOutlined />,
    title: "home.feature.history.title",
  },
  {
    description: "home.feature.output.description",
    icon: <CloudDownloadOutlined />,
    tags: [
      "home.feature.output.tag.publish",
      "home.feature.output.tag.pdf",
      "home.feature.output.tag.queue",
    ],
    title: "home.feature.output.title",
    wide: true,
  },
];

const templateImages = [
  {
    alt: "home.template.foundation.alt" as MessageKey,
    high: "/marketing/template-foundation-1198.webp",
    low: "/marketing/template-foundation-560.webp",
    meta: "home.template.foundation.meta" as MessageKey,
    title: "home.template.foundation.title" as MessageKey,
    width: 1198,
    height: 934,
  },
  {
    alt: "home.template.frontend.alt" as MessageKey,
    high: "/marketing/template-frontend-1209.webp",
    low: "/marketing/template-frontend-560.webp",
    meta: "home.template.frontend.meta" as MessageKey,
    title: "home.template.frontend.title" as MessageKey,
    width: 1209,
    height: 945,
  },
  {
    alt: "home.template.fullstack.alt" as MessageKey,
    high: "/marketing/template-fullstack-1209.webp",
    low: "/marketing/template-fullstack-560.webp",
    meta: "home.template.fullstack.meta" as MessageKey,
    title: "home.template.fullstack.title" as MessageKey,
    width: 1209,
    height: 955,
  },
] as const;

const fonts = [
  {
    className: "fontSans" as const,
    sample: "Aa 简",
    description: "home.font.manrope.description" as MessageKey,
    name: "Manrope",
  },
  {
    className: "fontSerif" as const,
    sample: "Aa 宋",
    description: "home.font.sourceSerif.description" as MessageKey,
    name: "Source Serif 4",
  },
  {
    className: "fontMono" as const,
    sample: "01 码",
    description: "home.font.notoMono.description" as MessageKey,
    name: "Noto Sans Mono",
  },
  {
    className: "fontDisplay" as const,
    sample: "Aa 展",
    description: "home.font.playfair.description" as MessageKey,
    name: "Playfair Display",
  },
] as const;

const steps = [
  ["home.step.create.title", "home.step.create.description"],
  ["home.step.edit.title", "home.step.edit.description"],
  ["home.step.deliver.title", "home.step.deliver.description"],
] as const satisfies ReadonlyArray<readonly [MessageKey, MessageKey]>;

export function MarketingHome() {
  const { styles } = useMarketingHomeStyles();
  const { t } = useI18n();
  const sourceCodeUrl = process.env.NEXT_PUBLIC_SOURCE_CODE_URL?.trim();

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        {t("home.skipToContent")}
      </a>

      <header className={styles.header}>
        <div className={styles.nav}>
          <a aria-label={t("common.appName")} className={styles.brandLink} href="#top">
            <AnonResumeLogo
              className={styles.navLogo}
              loading="eager"
              variant="lockup"
            />
          </a>
          <nav aria-label={t("home.navigation")} className={styles.navLinks}>
            <a href="#features">{t("home.navigation.features")}</a>
            <a href="#editor">{t("home.navigation.editor")}</a>
            <a href="#templates">{t("home.navigation.templates")}</a>
            <a href="#typography">{t("home.navigation.fonts")}</a>
          </nav>
          <div className={styles.navActions}>
            <span className={styles.desktopOnly}>
              <Button href="/sign-in" type="text">
                {t("common.signIn")}
              </Button>
            </span>
            <Button href="/sign-in" type="primary">
              {t("home.start")}
            </Button>
          </div>
        </div>
      </header>

      <main className={styles.main} id="main-content">
        <section className={styles.hero} id="top">
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>
                <SafetyCertificateOutlined />
                {t("home.eyebrow")}
              </p>
              <h1 className={styles.heroTitle}>
                {t("home.hero.lineOne")}
                <br />
                <span className={styles.heroAccent}>{t("home.hero.lineTwo")}</span>
              </h1>
              <p className={styles.heroLead}>{t("home.lead")}</p>
              <div className={styles.heroActions}>
                <Button
                  className={styles.primaryAction}
                  href="/sign-in"
                  icon={<ArrowRightOutlined />}
                  iconPlacement="end"
                  size="large"
                  type="primary"
                >
                  {t("home.start")}
                </Button>
                <Button className={styles.secondaryAction} href="#features" size="large">
                  {t("home.viewFeatures")}
                </Button>
              </div>
              <div className={styles.heroProof}>
                <span>
                  <CheckCircleFilled />
                  {t("home.proof.openSource")}
                </span>
                <span>
                  <CheckCircleFilled />
                  {t("home.proof.renderer")}
                </span>
                <span>
                  <CheckCircleFilled />
                  {t("home.proof.account")}
                </span>
              </div>
            </div>

            <div className={styles.heroVisual}>
              <div className={styles.screenshotFrame}>
                <picture>
                  <source media="(max-width: 768px)" srcSet="/marketing/editor-960.webp" />
                  <Image
                    alt={t("home.editorImageAlt")}
                    height={1012}
                    loading="eager"
                    sizes="(max-width: 768px) 94vw, (max-width: 1200px) 88vw, 1120px"
                    src="/marketing/editor-2048.webp"
                    width={2048}
                  />
                </picture>
              </div>
              <div className={styles.floatingNote}>
                <FileSearchOutlined />
                <div>
                  <strong>{t("home.floatingNote.title")}</strong>
                  <small>{t("home.floatingNote.description")}</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionAlt}`} id="features">
          <div className={styles.sectionInner}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionKicker}>{t("home.features.kicker")}</p>
              <h2 className={styles.sectionTitle}>{t("home.features.title")}</h2>
              <p className={styles.sectionLead}>{t("home.features.description")}</p>
            </div>
            <div className={styles.featureGrid}>
              {features.map((feature) => (
                <article
                  className={styles.featureCard}
                  data-wide={feature.wide ? "true" : "false"}
                  key={feature.title}
                >
                  <span className={styles.featureIcon}>{feature.icon}</span>
                  <h3>{t(feature.title)}</h3>
                  <p>{t(feature.description)}</p>
                  {feature.tags ? (
                    <div className={styles.featureTags}>
                      {feature.tags.map((tag) => (
                        <span key={tag}>{t(tag)}</span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} id="editor">
          <div className={`${styles.sectionInner} ${styles.showcase}`}>
            <div>
              <p className={styles.sectionKicker}>{t("home.editor.kicker")}</p>
              <h2 className={styles.sectionTitle}>{t("home.editor.title")}</h2>
              <p className={styles.sectionLead}>{t("home.editor.description")}</p>
              <ul className={styles.showcaseList}>
                <li>
                  <CheckCircleFilled />
                  <div>
                    <strong>{t("home.editor.point.structure.title")}</strong>
                    <span>{t("home.editor.point.structure.description")}</span>
                  </div>
                </li>
                <li>
                  <CheckCircleFilled />
                  <div>
                    <strong>{t("home.editor.point.design.title")}</strong>
                    <span>{t("home.editor.point.design.description")}</span>
                  </div>
                </li>
                <li>
                  <CheckCircleFilled />
                  <div>
                    <strong>{t("home.editor.point.output.title")}</strong>
                    <span>{t("home.editor.point.output.description")}</span>
                  </div>
                </li>
              </ul>
            </div>
            <div className={styles.showcaseImage}>
              <picture>
                <source media="(max-width: 768px)" srcSet="/marketing/editor-960.webp" />
                <Image
                  alt={t("home.editorShowcaseImageAlt")}
                  height={1012}
                  loading="lazy"
                  sizes="(max-width: 980px) 94vw, 680px"
                  src="/marketing/editor-2048.webp"
                  width={2048}
                />
              </picture>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionAlt}`} id="templates">
          <div className={styles.sectionInner}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionKicker}>{t("home.templates.kicker")}</p>
              <h2 className={styles.sectionTitle}>{t("home.templates.title")}</h2>
              <p className={styles.sectionLead}>{t("home.templates.description")}</p>
            </div>
            <div className={styles.templateGrid}>
              {templateImages.map((template) => (
                <figure className={styles.templateCard} key={template.high}>
                  <picture>
                    <source media="(max-width: 760px)" srcSet={template.low} />
                    <Image
                      alt={t(template.alt)}
                      height={template.height}
                      loading="lazy"
                      sizes="(max-width: 760px) 94vw, (max-width: 1180px) 31vw, 373px"
                      src={template.high}
                      width={template.width}
                    />
                  </picture>
                  <figcaption>
                    <strong>{t(template.title)}</strong>
                    <span>{t(template.meta)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} id="typography">
          <div className={styles.sectionInner}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionKicker}>{t("home.fonts.kicker")}</p>
              <h2 className={styles.sectionTitle}>{t("home.fonts.title")}</h2>
              <p className={styles.sectionLead}>{t("home.fonts.description")}</p>
            </div>
            <div className={styles.typeGrid}>
              {fonts.map((font) => (
                <article className={styles.typeCard} key={font.name}>
                  <p className={styles[font.className]}>{font.sample}</p>
                  <div>
                    <strong>{font.name}</strong>
                    <span>{t(font.description)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionAlt}`}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionIntro}>
              <p className={styles.sectionKicker}>{t("home.steps.kicker")}</p>
              <h2 className={styles.sectionTitle}>{t("home.steps.title")}</h2>
            </div>
            <div className={styles.steps}>
              {steps.map(([title, description]) => (
                <article className={styles.step} key={title}>
                  <h3>{t(title)}</h3>
                  <p>{t(description)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.cta}>
          <div className={styles.ctaInner}>
            <div>
              <h2>{t("home.cta.title")}</h2>
              <p>{t("home.cta.description")}</p>
            </div>
            <Button
              className={styles.primaryAction}
              href="/sign-in"
              icon={<ArrowRightOutlined />}
              iconPlacement="end"
              size="large"
              type="primary"
            >
              {t("home.start")}
            </Button>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <AnonResumeLogo className={styles.footerLogo} loading="lazy" variant="lockup" />
          <span>{t("home.footer.description")}</span>
          <div className={styles.footerLinks}>
            {sourceCodeUrl ? (
              <a href={sourceCodeUrl} rel="noreferrer" target="_blank">
                <CodeOutlined /> {t("common.settings.sourceCode")}
              </a>
            ) : null}
            <a href="/license">{t("common.settings.license")}</a>
            <a href="/third-party-notices">{t("common.settings.thirdPartyNotices")}</a>
            <a href="/brand-notice">{t("common.settings.brandNotice")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
