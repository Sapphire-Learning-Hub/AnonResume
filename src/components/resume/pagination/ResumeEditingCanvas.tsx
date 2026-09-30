"use client";

import type { CSSProperties, ReactNode } from "react";

import { useI18n } from "@/i18n/I18nProvider";

import { useResumeEditingCanvasStyles } from "./ResumeEditingCanvas.style";

interface PagePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResumeEditingCanvasProps {
  pageCount: number;
  pageHeight: number;
  pageWidth: number;
  pageGap: number;
  pagePadding: PagePadding;
  styleVariables: CSSProperties;
  showPrintSafeArea: boolean;
  children: ReactNode;
}

export function ResumeEditingCanvas({
  pageCount,
  pageHeight,
  pageWidth,
  pageGap,
  pagePadding,
  styleVariables,
  showPrintSafeArea,
  children,
}: ResumeEditingCanvasProps) {
  const { styles } = useResumeEditingCanvasStyles();
  const { t } = useI18n();
  const resolvedPageCount = Math.max(1, pageCount);
  const canvasHeight =
    resolvedPageCount * pageHeight +
    Math.max(0, resolvedPageCount - 1) * pageGap;
  const canvasVariables = {
    ...styleVariables,
    "--resume-edit-page-width": `${pageWidth}px`,
    "--resume-edit-page-height": `${pageHeight}px`,
    "--resume-page-padding": `${pagePadding.top}px ${pagePadding.right}px ${pagePadding.bottom}px ${pagePadding.left}px`,
    height: canvasHeight,
  } as CSSProperties;

  return (
    <div
      className={styles.canvas}
      data-resume-editing-canvas="true"
      style={canvasVariables}
    >
      <div className={styles.pageLayer} aria-hidden="true">
        {Array.from({ length: resolvedPageCount }, (_, index) => (
          <div
            key={index}
            className={styles.page}
            data-resume-editing-page="true"
            data-resume-page="true"
            data-resume-page-index={index + 1}
            data-testid={`resume-page-${index + 1}`}
            style={{ top: index * (pageHeight + pageGap) }}
          >
            <div className={styles.pageLabel} data-print-chrome="screen">
              {t("renderer.pageLabel", { index: index + 1 })}
            </div>
            {showPrintSafeArea ? (
              <div
                aria-hidden="true"
                className={styles.safeArea}
                data-resume-print-safe-area="true"
              />
            ) : null}
          </div>
        ))}
      </div>
      <article
        className={styles.content}
        data-resume-editing-content="true"
        style={styleVariables}
      >
        {children}
      </article>
    </div>
  );
}
