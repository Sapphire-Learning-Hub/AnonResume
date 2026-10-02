import type { EditorOnboardingStepId } from "@/domain/onboarding/editor-basics";

export type EditorOnboardingStatus =
  | "active"
  | "paused"
  | "completed"
  | "dismissed"
  | "ineligible";

export type EditorOnboardingSource =
  | "automatic"
  | "manual"
  | "development";

export interface EditorOnboardingRun {
  id: string;
  userId: string;
  flowKey: string;
  flowVersion: number;
  source: EditorOnboardingSource;
  resumeId?: string;
  status: EditorOnboardingStatus;
  currentStep: EditorOnboardingStepId;
  autoOpenedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface EditorOnboardingEntryDecision {
  run?: EditorOnboardingRun;
  promptHref?: string;
  continueHref?: string;
}

export type EditorOnboardingTransitionAction =
  | { type: "start" }
  | {
      type: "complete-step";
      stepId: EditorOnboardingStepId;
    }
  | {
      type: "skip-step";
      stepId: EditorOnboardingStepId;
    }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "dismiss" }
  | { type: "complete" };
