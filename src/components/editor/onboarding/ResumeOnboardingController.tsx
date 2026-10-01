"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  getEditorOnboardingStep,
} from "@/domain/onboarding/editor-basics";
import { evaluateEditorOnboardingDocumentStep } from "@/domain/onboarding/editor-basics-document";
import type { ResumeDocument } from "@/domain/resume/schema";
import { useI18n } from "@/i18n/I18nProvider";
import {
  updateEditorOnboardingRunClient,
} from "@/lib/onboarding/client";
import type {
  EditorOnboardingRun,
  EditorOnboardingTransitionAction,
} from "@/lib/onboarding/types";
import type { ResumeEditorSaveStatus } from "@/stores/resume-editor";
import { useAppFeedback } from "@/components/ui/useAppFeedback";

import { ResumeOnboardingOverlay } from "./ResumeOnboardingOverlay";
import { findOnboardingAnchor, useOnboardingAnchor } from "./useOnboardingAnchor";

type OnboardingRibbonTab = "home" | "insert" | "design" | "layout";

export function ResumeOnboardingController({
  document: resumeDocument,
  onSelectRibbonTab,
  run: initialRun,
  saveStatus,
}: {
  document: ResumeDocument;
  onSelectRibbonTab: (tab: OnboardingRibbonTab) => void;
  run: EditorOnboardingRun;
  saveStatus: ResumeEditorSaveStatus;
}) {
  const { t } = useI18n();
  const { toast } = useAppFeedback();
  const [optimisticRun, setOptimisticRun] = useState(() => ({
    source: initialRun,
    value: initialRun,
  }));
  const run =
    optimisticRun.source.id === initialRun.id &&
    optimisticRun.source.updatedAt === initialRun.updatedAt
      ? optimisticRun.value
      : initialRun;
  const [busy, setBusy] = useState(false);
  const [anchorRevision, setAnchorRevision] = useState(0);
  const inFlightRef = useRef<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
  );
  const step = getEditorOnboardingStep(run.currentStep);
  const anchor = useOnboardingAnchor(step?.anchorId ?? "", anchorRevision);

  function restoreFocus() {
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  async function performTransition(action: EditorOnboardingTransitionAction) {
    const key = `${run.id}:${action.type}:${"stepId" in action ? action.stepId : ""}`;
    if (inFlightRef.current) return;

    inFlightRef.current = key;
    setBusy(true);
    try {
      const updated = await updateEditorOnboardingRunClient(run.id, action);
      setOptimisticRun({ source: initialRun, value: updated });
      if (updated.status === "completed" || updated.status === "dismissed") {
        restoreFocus();
      }
    } catch {
      toast.error({
        content: t("onboarding.error.transitionFailed"),
        key: "editor-onboarding-transition-error",
      });
    } finally {
      inFlightRef.current = null;
      setBusy(false);
    }
  }

  const completePersistedStep = useEffectEvent(() => {
    if (!step || step.completion !== "persisted-document") return;
    void performTransition({ type: "complete-step", stepId: step.id });
  });

  useEffect(() => {
    if (
      run.status === "active" &&
      step?.completion === "persisted-document" &&
      saveStatus === "saved" &&
      evaluateEditorOnboardingDocumentStep(step.id, resumeDocument)
    ) {
      queueMicrotask(completePersistedStep);
    }
  }, [resumeDocument, run.status, saveStatus, step]);

  if (
    !step ||
    run.status === "completed" ||
    run.status === "dismissed" ||
    run.status === "ineligible"
  ) {
    return null;
  }

  const handleNavigate = () => {
    if (step.ribbonTab) onSelectRibbonTab(step.ribbonTab);
    requestAnimationFrame(() => {
      const target = findOnboardingAnchor(step.anchorId);
      target?.scrollIntoView({ block: "center", inline: "nearest" });
      target?.focus({ preventScroll: true });
    });
  };

  const canAdvance = step.completion === "client-event";

  return (
    <ResumeOnboardingOverlay
      actions={{
        ...(canAdvance
          ? {
              onAdvance: () => {
                void performTransition(
                  step.id === "output-overview"
                    ? { type: "complete" }
                    : { type: "complete-step", stepId: step.id },
                );
              },
            }
          : {}),
        onDismiss: () => void performTransition({ type: "dismiss" }),
        onNavigate: handleNavigate,
        onPause: () => void performTransition({ type: "pause" }),
        onResume: () => void performTransition({ type: "resume" }),
        onRetry: () => setAnchorRevision((current) => current + 1),
        onSkip: () =>
          void performTransition({ type: "skip-step", stepId: step.id }),
      }}
      anchor={anchor}
      state={
        busy
          ? "busy"
          : run.status === "paused"
            ? "paused"
            : anchor
              ? "active"
              : "missing"
      }
      step={step}
    />
  );
}
