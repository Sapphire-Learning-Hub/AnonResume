import type { MessageKey } from "@/i18n/messages";

export const EDITOR_BASICS_FLOW_KEY = "editor-basics";
export const EDITOR_BASICS_FLOW_VERSION = 1;

export const editorOnboardingStepIds = [
  "canvas-intro",
  "edit-text",
  "format-text",
  "insert-content",
  "change-design",
  "reorder-content",
  "preview",
  "output-overview",
] as const;

export type EditorOnboardingStepId =
  (typeof editorOnboardingStepIds)[number];

export type EditorOnboardingCompletionKind =
  | "client-event"
  | "persisted-document"
  | "preview-route";

export interface EditorOnboardingStepDefinition {
  id: EditorOnboardingStepId;
  anchorId: string;
  ribbonTab?: "home" | "insert" | "design" | "layout";
  completion: EditorOnboardingCompletionKind;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
}

export const editorOnboardingSteps = [
  {
    id: "canvas-intro",
    anchorId: "editor-canvas",
    completion: "client-event",
    titleKey: "onboarding.step.canvas-intro.title",
    descriptionKey: "onboarding.step.canvas-intro.description",
  },
  {
    id: "edit-text",
    anchorId: "onboarding-edit-target",
    ribbonTab: "home",
    completion: "persisted-document",
    titleKey: "onboarding.step.edit-text.title",
    descriptionKey: "onboarding.step.edit-text.description",
  },
  {
    id: "format-text",
    anchorId: "editor-format-bold",
    ribbonTab: "home",
    completion: "persisted-document",
    titleKey: "onboarding.step.format-text.title",
    descriptionKey: "onboarding.step.format-text.description",
  },
  {
    id: "insert-content",
    anchorId: "editor-insert-content",
    ribbonTab: "insert",
    completion: "persisted-document",
    titleKey: "onboarding.step.insert-content.title",
    descriptionKey: "onboarding.step.insert-content.description",
  },
  {
    id: "change-design",
    anchorId: "editor-visual-preset",
    ribbonTab: "design",
    completion: "persisted-document",
    titleKey: "onboarding.step.change-design.title",
    descriptionKey: "onboarding.step.change-design.description",
  },
  {
    id: "reorder-content",
    anchorId: "editor-reorder-content",
    ribbonTab: "layout",
    completion: "persisted-document",
    titleKey: "onboarding.step.reorder-content.title",
    descriptionKey: "onboarding.step.reorder-content.description",
  },
  {
    id: "preview",
    anchorId: "editor-preview",
    completion: "preview-route",
    titleKey: "onboarding.step.preview.title",
    descriptionKey: "onboarding.step.preview.description",
  },
  {
    id: "output-overview",
    anchorId: "editor-output-actions",
    completion: "client-event",
    titleKey: "onboarding.step.output-overview.title",
    descriptionKey: "onboarding.step.output-overview.description",
  },
] as const satisfies readonly EditorOnboardingStepDefinition[];

export function getEditorOnboardingStep(stepId: EditorOnboardingStepId) {
  return editorOnboardingSteps.find(({ id }) => id === stepId);
}
