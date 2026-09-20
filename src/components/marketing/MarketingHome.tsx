"use client";

import {
  ApiOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  CloudServerOutlined,
  CloudDownloadOutlined,
  CodeOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  ImportOutlined,
  LayoutOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SkinOutlined,
} from "@ant-design/icons";
import { Button } from "antd";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";
import { AnnouncementBanner } from "@/components/announcements/AnnouncementBanner";
import { usePublicRuntimeConfig } from "@/components/config/usePublicRuntimeConfig";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";

import { useMarketingHomeStyles } from "./MarketingHome.style";

type Feature = {
  ai?: boolean;
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
    ai: true,
    description: "home.ai.description",
    icon: <RobotOutlined />,
    tags: [
      "home.ai.point.context.title",
      "home.ai.point.structure.title",
      "home.ai.point.preview.title",
    ],
    title: "home.ai.eyebrow",
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
  ["home.step.ai.title", "home.step.ai.description"],
  ["home.step.edit.title", "home.step.edit.description"],
  ["home.step.deliver.title", "home.step.deliver.description"],
] as const satisfies ReadonlyArray<readonly [MessageKey, MessageKey]>;

const openValues = [
  {
    description: "home.open.source.description" as MessageKey,
    icon: <CodeOutlined />,
    title: "home.open.source.title" as MessageKey,
  },
  {
    description: "home.open.selfHost.description" as MessageKey,
    icon: <CloudServerOutlined />,
    title: "home.open.selfHost.title" as MessageKey,
  },
  {
    description: "home.open.data.description" as MessageKey,
    icon: <DatabaseOutlined />,
    title: "home.open.data.title" as MessageKey,
  },
  {
    description: "home.open.models.description" as MessageKey,
    icon: <ApiOutlined />,
    title: "home.open.models.title" as MessageKey,
  },
] as const;

const MIN_SCROLL_DURATION_MS = 360;
const MAX_SCROLL_DURATION_MS = 700;

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3;
}

function MarketingTemplateLoading() {
  const { styles } = useMarketingHomeStyles();
  const { t } = useI18n();

  return (
    <div className={styles.templateLoading} role="status">
      <span />
      {t("home.templates.loading")}
    </div>
  );
}

const MarketingTemplateShowcase = dynamic(
  () =>
    import("./MarketingTemplateShowcase").then(
      (module) => module.MarketingTemplateShowcase,
    ),
  {
    loading: MarketingTemplateLoading,
    ssr: false,
  },
);

export function MarketingHome({
  announcements = [],
}: {
  announcements?: readonly LocalizedAnnouncement[];
}) {
  const { styles } = useMarketingHomeStyles();
  const { t } = useI18n();
  const { sourceCodeUrl } = usePublicRuntimeConfig();
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const scrollAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const updateHeaderState = () => {
      setHeaderScrolled(window.scrollY > 32);
    };

    updateHeaderState();
    window.addEventListener("scroll", updateHeaderState, { passive: true });

    return () => {
      if (scrollAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      }
      window.removeEventListener("scroll", updateHeaderState);
    };
  }, []);

  const handleInPageNavigation = (event: ReactMouseEvent<HTMLDivElement>) => {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) {
      return;
    }

    const anchor = eventTarget.closest<HTMLAnchorElement>(
      'a[data-marketing-scroll="true"]',
    );
    const hash = anchor?.hash;
    if (!hash) {
      return;
    }

    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) {
      return;
    }

    event.preventDefault();
    window.history.pushState(null, "", hash);

    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
    }

    const startY = window.scrollY;
    const scrollMarginTop = Number.parseFloat(
      window.getComputedStyle(target).scrollMarginTop,
    );
    const targetY = Math.max(
      0,
      startY + target.getBoundingClientRect().top - (scrollMarginTop || 0),
    );
    const distance = targetY - startY;
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (prefersReducedMotion || Math.abs(distance) < 1) {
      window.scrollTo(0, targetY);
      scrollAnimationFrameRef.current = null;
      return;
    }

    const duration = Math.min(
      MAX_SCROLL_DURATION_MS,
      Math.max(MIN_SCROLL_DURATION_MS, Math.abs(distance) * 0.35),
    );
    const startedAt = window.performance.now();
    const animateScroll = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      window.scrollTo(0, startY + distance * easeOutCubic(progress));

      if (progress < 1) {
        scrollAnimationFrameRef.current = window.requestAnimationFrame(animateScroll);
      } else {
        scrollAnimationFrameRef.current = null;
      }
    };

    scrollAnimationFrameRef.current = window.requestAnimationFrame(animateScroll);
  };

  return (
    <div className={styles.shell} onClick={handleInPageNavigation}>
      <a className={styles.skipLink} href="#main-content">
        {t("home.skipToContent")}
      </a>

      <header
        className={styles.header}
        data-scrolled={headerScrolled ? "true" : "false"}
      >
        <div className={styles.nav} data-marketing-navigation="true">
          <a
            aria-label={t("common.appName")}
            className={styles.brandLink}
            data-marketing-brand="true"
            data-marketing-scroll="true"
            href="#top"
          >
            <AnonResumeLogo
              className={styles.navLogo}
              loading="eager"
              variant="lockup"
            />
          </a>
          <nav
            aria-label={t("home.navigation")}
            className={styles.navLinks}
            data-marketing-links="true"
          >
            <a data-marketing-scroll="true" href="#ai-assistant">
              {t("home.navigation.ai")}
            </a>
            <a data-marketing-scroll="true" href="#editor">
              {t("home.navigation.editor")}
            </a>
            <a data-marketing-scroll="true" href="#templates">
              {t("home.navigation.templates")}
            </a>
            <a data-marketing-scroll="true" href="#open-source">
              {t("home.navigation.open")}
            </a>
          </nav>
          <div className={styles.navActions}>
            <Button href="/sign-in" type="primary">
              {t("home.start")}
            </Button>
          </div>
        </div>
      </header>

      <main className={styles.main} id="main-content">
        <section className={styles.hero} id="top">
          {announcements.length > 0 ? (
            <div className={styles.announcementSlot}>
              <AnnouncementBanner announcements={announcements} />
            </div>
          ) : null}
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
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
                <Button
                  className={styles.secondaryAction}
                  data-marketing-scroll="true"
                  href="#features"
                  size="large"
                >
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
                  <source
                    media="(max-width: 768px)"
                    srcSet="/marketing/editor-modular-16x9-v4-960.webp"
                  />
                  <Image
                    alt={t("home.editorImageAlt")}
                    height={1152}
                    loading="eager"
                    sizes="(max-width: 768px) 94vw, (max-width: 1200px) 88vw, 1120px"
                    src="/marketing/editor-modular-16x9-v4-2048.webp"
                    width={2048}
                  />
                </picture>
              </div>
              <div className={styles.floatingNote}>
                <RobotOutlined />
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
              <h2 className={styles.sectionTitle}>{t("home.features.title")}</h2>
              <p className={styles.sectionLead}>{t("home.features.description")}</p>
            </div>
            <div className={styles.featureGrid}>
              {features.map((feature) => (
                <article
                  className={styles.featureCard}
                  data-ai={feature.ai ? "true" : "false"}
                  data-wide={feature.wide ? "true" : "false"}
                  id={feature.ai ? "ai-assistant" : undefined}
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
                  {feature.ai ? (
                    <div aria-hidden="true" className={styles.featureAiPreview}>
                      <div className={styles.featureAiPrompt}>
                        {t("home.ai.mock.prompt")}
                      </div>
                      <div className={styles.featureAiStatus}>
                        <RobotOutlined />
                        <span>{t("home.ai.mock.analyzed")}</span>
                      </div>
                      <div className={styles.featureAiSuggestion}>
                        <strong>{t("home.ai.mock.proposal")}</strong>
                        <p>{t("home.ai.mock.suggestion")}</p>
                        <div>
                          <span>{t("home.ai.mock.preview")}</span>
                          <b>{t("home.ai.mock.apply")}</b>
                        </div>
                      </div>
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
                <source
                  media="(max-width: 768px)"
                  srcSet="/marketing/editor-modular-16x9-v4-960.webp"
                />
                <Image
                  alt={t("home.editorShowcaseImageAlt")}
                  height={1152}
                  loading="lazy"
                  sizes="(max-width: 980px) 94vw, 680px"
                  src="/marketing/editor-modular-16x9-v4-2048.webp"
                  width={2048}
                />
              </picture>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionAlt}`} id="templates">
          <div className={styles.sectionInner}>
            <MarketingTemplateShowcase />
          </div>
        </section>

        <section className={styles.section} id="typography">
          <div className={styles.sectionInner}>
            <div className={styles.sectionIntro}>
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

        <section
          className={`${styles.section} ${styles.openSection}`}
          id="open-source"
        >
          <div className={styles.sectionInner}>
            <div className={styles.openIntro}>
              <span className={styles.sectionEyebrow}>{t("home.open.eyebrow")}</span>
              <h2 className={styles.sectionTitle}>{t("home.open.title")}</h2>
              <p className={styles.sectionLead}>{t("home.open.description")}</p>
            </div>
            <div className={styles.openGrid}>
              {openValues.map((value) => (
                <article className={styles.openCard} key={value.title}>
                  <span>{value.icon}</span>
                  <h3>{t(value.title)}</h3>
                  <p>{t(value.description)}</p>
                </article>
              ))}
            </div>
            <div className={styles.openAssurance}>
              <SafetyCertificateOutlined />
              <span>{t("home.open.assurance")}</span>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionAlt}`}>
          <div className={styles.sectionInner}>
            <div className={styles.sectionIntro}>
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
