"use client";

import { Button } from "antd";
import { createPortal } from "react-dom";

import {
  editorOnboardingSteps,
  type EditorOnboardingStepDefinition,
} from "@/domain/onboarding/editor-basics";
import { useI18n } from "@/i18n/I18nProvider";

import { useResumeOnboardingOverlayStyles } from "./ResumeOnboardingOverlay.style";

export type ResumeOnboardingOverlayState =
  | "active"
  | "busy"
  | "missing"
  | "paused";

export interface ResumeOnboardingOverlayActions {
  onAdvance?: () => void;
  onDismiss: () => void;
  onNavigate?: () => void;
  onPause: () => void;
  onResume?: () => void;
  onRetry: () => void;
  onSkip: () => void;
}

function resolveCardPosition(anchor: DOMRectReadOnly | null) {
  if (!anchor || typeof window === "undefined") {
    return {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const inset = 16;
  const gap = 14;
  const cardWidth = Math.min(360, window.innerWidth - inset * 2);
  const cardHeight = 280;
  const verticalTop = Math.min(
    Math.max(inset, anchor.top),
    Math.max(inset, window.innerHeight - cardHeight - inset),
  );
  const right = anchor.right + gap;
  if (right + cardWidth <= window.innerWidth - inset) {
    return { left: right, top: verticalTop };
  }

  const left = anchor.left - cardWidth - gap;
  if (left >= inset) {
    return { left, top: verticalTop };
  }

  const horizontalLeft = Math.min(
    Math.max(inset, anchor.left),
    Math.max(inset, window.innerWidth - cardWidth - inset),
  );
  const below = anchor.bottom + gap;
  if (below + cardHeight <= window.innerHeight - inset) {
    return { left: horizontalLeft, top: below };
  }

  return {
    left: horizontalLeft,
    top: Math.max(inset, anchor.top - cardHeight - gap),
  };
}

export function ResumeOnboardingOverlay({
  actions,
  anchor,
  state,
  step,
}: {
  actions: ResumeOnboardingOverlayActions;
  anchor: DOMRectReadOnly | null;
  state: ResumeOnboardingOverlayState;
  step: EditorOnboardingStepDefinition;
}) {
  const { styles } = useResumeOnboardingOverlayStyles();
  const { t } = useI18n();
  const stepIndex = editorOnboardingSteps.findIndex(({ id }) => id === step.id);
  const busy = state === "busy";
  const cardPosition = resolveCardPosition(anchor);
  const padding = 6;
  const showPrimaryActions =
    state === "missing" ||
    state === "paused" ||
    Boolean(actions.onNavigate || actions.onAdvance);

  const overlay = (
    <div className={styles.root} data-state={state}>
      {anchor ? (
        <>
          <div
            className={styles.shade}
            style={{ inset: `0 0 auto 0`, height: Math.max(0, anchor.top - padding) }}
          />
          <div
            className={styles.shade}
            style={{
              left: 0,
              top: Math.max(0, anchor.top - padding),
              width: Math.max(0, anchor.left - padding),
              height: anchor.height + padding * 2,
            }}
          />
          <div
            className={styles.shade}
            style={{
              left: anchor.right + padding,
              right: 0,
              top: Math.max(0, anchor.top - padding),
              height: anchor.height + padding * 2,
            }}
          />
          <div
            className={styles.shade}
            style={{ top: anchor.bottom + padding, right: 0, bottom: 0, left: 0 }}
          />
          <div
            className={styles.highlight}
            data-testid="onboarding-highlight"
            style={{
              left: anchor.left - padding,
              top: anchor.top - padding,
              width: anchor.width + padding * 2,
              height: anchor.height + padding * 2,
            }}
          />
        </>
      ) : null}
      <section
        aria-label={t(step.titleKey)}
        aria-live="polite"
        className={styles.card}
        style={cardPosition}
      >
        <span className={styles.progress}>
          {t("onboarding.progress", {
            current: stepIndex + 1,
            total: editorOnboardingSteps.length,
          })}
        </span>
        <h2 className={styles.title}>{t(step.titleKey)}</h2>
        <p className={styles.description}>{t(step.descriptionKey)}</p>
        {state === "missing" ? (
          <p className={styles.error}>{t("onboarding.error.targetMissing")}</p>
        ) : null}
        {showPrimaryActions ? <div className={styles.primaryActions}>
          {state === "missing" ? (
            <Button disabled={busy} onClick={actions.onRetry}>
              {t("onboarding.action.retry")}
            </Button>
          ) : state === "paused" ? (
            <Button type="primary" onClick={actions.onResume}>
              {t("onboarding.action.resume")}
            </Button>
          ) : (
            <>
              {actions.onNavigate ? (
                <Button disabled={busy} onClick={actions.onNavigate}>
                  {t("onboarding.action.navigate")}
                </Button>
              ) : null}
              {actions.onAdvance ? (
                <Button loading={busy} type="primary" onClick={actions.onAdvance}>
                  {step.id === "output-overview"
                    ? t("onboarding.action.complete")
                    : t("onboarding.action.next")}
                </Button>
              ) : null}
            </>
          )}
        </div> : null}
        <div className={styles.secondaryActions}>
          {state === "active" || state === "missing" ? (
            <Button disabled={busy} type="text" onClick={actions.onSkip}>
              {t("onboarding.action.skip")}
            </Button>
          ) : <span />}
          <div>
            {state === "active" ? (
              <Button disabled={busy} type="text" onClick={actions.onPause}>
                {t("onboarding.action.pause")}
              </Button>
            ) : null}
            <Button disabled={busy} danger type="text" onClick={actions.onDismiss}>
              {t("onboarding.action.exit")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );

  return createPortal(overlay, document.body);
}
