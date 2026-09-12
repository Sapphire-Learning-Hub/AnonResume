"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { ResumeRenderer } from "@/components/resume/ResumeRenderer";
import {
  listResumeTemplates,
  type ResumeTemplate,
  type ResumeTemplateId,
} from "@/domain/resume/templates";
import { useI18n } from "@/i18n/I18nProvider";

import { useMarketingTemplateShowcaseStyles } from "./MarketingTemplateShowcase.style";

type MarketingTemplateId = Exclude<ResumeTemplateId, "blank">;

const TEMPLATE_STICKY_TOP_PX = 88;
const TEMPLATE_SCROLL_STEP_VH = 64;

function isMarketingTemplate(
  template: ResumeTemplate,
): template is ResumeTemplate & { id: MarketingTemplateId } {
  return template.id !== "blank";
}

function supportsScrollDrivenTemplates() {
  return (
    window.innerWidth > 900 &&
    !(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}

function getTemplateIndexForScroll(
  trackTop: number,
  scrollDistance: number,
  scrollStartTop: number,
  templateCount: number,
) {
  if (scrollDistance <= 0 || templateCount <= 1) {
    return 0;
  }

  const effectiveScrollDistance =
    scrollDistance + scrollStartTop - TEMPLATE_STICKY_TOP_PX;
  const progress = Math.min(
    1,
    Math.max(0, (scrollStartTop - trackTop) / effectiveScrollDistance),
  );

  return Math.round(progress * (templateCount - 1));
}

function getTemplateScrollStartTop(
  scrollTrack: HTMLElement,
  stickyHeight: number,
) {
  const section = scrollTrack.closest("section");
  if (section) {
    const sectionScrollMarginTop = Number.parseFloat(
      window.getComputedStyle(section).scrollMarginTop,
    );
    const trackOffsetWithinSection =
      scrollTrack.getBoundingClientRect().top -
      section.getBoundingClientRect().top;

    return Math.max(
      TEMPLATE_STICKY_TOP_PX,
      (sectionScrollMarginTop || 0) + trackOffsetWithinSection,
    );
  }

  return Math.max(TEMPLATE_STICKY_TOP_PX, window.innerHeight - stickyHeight);
}

export function MarketingTemplateShowcase() {
  const { styles } = useMarketingTemplateShowcaseStyles();
  const { locale, t } = useI18n();
  const templates = listResumeTemplates(locale).filter(isMarketingTemplate);
  const [activeTemplateId, setActiveTemplateId] =
    useState<MarketingTemplateId>("centered");
  const activeTemplate =
    templates.find((template) => template.id === activeTemplateId) ?? templates[0];
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const stickyFrameRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const templateOrder = templates.map((template) => template.id).join("|");

  useEffect(() => {
    const templateIds = templateOrder.split("|").filter(Boolean) as MarketingTemplateId[];
    const updateActiveTemplate = () => {
      const scrollTrack = scrollTrackRef.current;
      const stickyFrame = stickyFrameRef.current;
      if (!scrollTrack || !stickyFrame || !supportsScrollDrivenTemplates()) {
        return;
      }

      const scrollDistance = scrollTrack.offsetHeight - stickyFrame.offsetHeight;
      const scrollStartTop = getTemplateScrollStartTop(
        scrollTrack,
        stickyFrame.offsetHeight,
      );
      const activeIndex = getTemplateIndexForScroll(
        scrollTrack.getBoundingClientRect().top,
        scrollDistance,
        scrollStartTop,
        templateIds.length,
      );
      const nextTemplateId = templateIds[activeIndex];
      if (nextTemplateId) {
        setActiveTemplateId((current) =>
          current === nextTemplateId ? current : nextTemplateId,
        );
      }
    };
    const scheduleUpdate = () => {
      if (scrollFrameRef.current !== null) {
        return;
      }

      scrollFrameRef.current = -1;
      const frameId = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        updateActiveTemplate();
      });
      if (scrollFrameRef.current !== null) {
        scrollFrameRef.current = frameId;
      }
    };

    updateActiveTemplate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (scrollFrameRef.current !== null && scrollFrameRef.current >= 0) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      scrollFrameRef.current = null;
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [templateOrder]);

  if (!activeTemplate) {
    return null;
  }

  const scrollTrackStyle = {
    "--template-scroll-distance": `${Math.max(0, templates.length - 1) * TEMPLATE_SCROLL_STEP_VH}vh`,
  } as CSSProperties;

  return (
    <div
      className={styles.scrollTrack}
      data-template-scroll-track
      ref={scrollTrackRef}
      style={scrollTrackStyle}
    >
      <div
        className={styles.stickyFrame}
        data-template-sticky-frame
        ref={stickyFrameRef}
      >
        <div className={styles.sectionIntro}>
          <h2 className={styles.sectionTitle}>{t("home.templates.title")}</h2>
          <p className={styles.sectionLead}>{t("home.templates.description")}</p>
        </div>
        <div className={styles.showcase}>
          <div className={styles.selectorPanel}>
            <div>
              <h3>{t(activeTemplate.nameKey)}</h3>
              <p>{t(activeTemplate.descriptionKey)}</p>
            </div>

            <div aria-hidden="true" className={styles.templateSelector}>
              {templates.map((template) => (
                <div
                  data-active={template.id === activeTemplate.id ? "true" : "false"}
                  data-template-indicator={template.id}
                  key={template.id}
                >
                  <span>{t(template.nameKey)}</span>
                  <small>{t(template.descriptionKey)}</small>
                </div>
              ))}
            </div>
          </div>

          <div
            aria-label={t("home.templates.previewLabel", {
              name: t(activeTemplate.nameKey),
            })}
            className={styles.previewStage}
            role="img"
          >
            <div className={styles.previewGlow} />
            <div className={styles.previewViewport}>
              <div className={styles.previewDocument} key={activeTemplate.id}>
                <ResumeRenderer document={activeTemplate.document} mode="view" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className={styles.scrollSpacer} />
    </div>
  );
}
