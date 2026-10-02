import { createHash, randomUUID } from "node:crypto";

import {
  EDITOR_BASICS_FLOW_KEY,
  EDITOR_BASICS_FLOW_VERSION,
  editorOnboardingSteps,
  getEditorOnboardingStep,
  type EditorOnboardingStepId,
} from "@/domain/onboarding/editor-basics";
import { evaluateEditorOnboardingDocumentStep } from "@/domain/onboarding/editor-basics-document";
import type { AppLocale } from "@/i18n/messages";
import { readNodeEnvironment } from "@/lib/config/process-environment";

import {
  countStandardResumes,
  createEditorOnboardingResume,
  deleteOrphanedOnboardingResumes,
  deleteOwnedOnboardingResume,
  findActiveEditorOnboardingRun,
  findEditorOnboardingRunById,
  findEditorOnboardingRunByTrigger,
  findLatestEditorOnboardingRun,
  getOwnedOnboardingResumeDocument,
  insertEditorOnboardingRun,
  updateEditorOnboardingRun,
  withEditorOnboardingUserLock,
} from "./repository";
import type {
  EditorOnboardingEntryDecision,
  EditorOnboardingRun,
  EditorOnboardingTransitionAction,
} from "./types";

const FIRST_STEP = editorOnboardingSteps[0].id;
const PRODUCTION_TRIGGER = `${EDITOR_BASICS_FLOW_KEY}:v${EDITOR_BASICS_FLOW_VERSION}:automatic`;

export class EditorOnboardingTransitionError extends Error {
  constructor() {
    super("editor_onboarding_transition_rejected");
    this.name = "EditorOnboardingTransitionError";
  }
}

function createEditorHref(resumeId: string) {
  return `/app/resumes/${resumeId}`;
}

function createDevelopmentTrigger(sessionId: string) {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  return `${EDITOR_BASICS_FLOW_KEY}:v${EDITOR_BASICS_FLOW_VERSION}:development:${digest}`;
}

function createAvailableRunDecision(
  run: EditorOnboardingRun,
): EditorOnboardingEntryDecision {
  if (!run.resumeId) return { run };

  const href = createEditorHref(run.resumeId);
  const shouldPrompt =
    run.status === "active" &&
    !run.autoOpenedAt &&
    (run.source === "automatic" || run.source === "development");

  return shouldPrompt
    ? { run, promptHref: href }
    : { run, continueHref: href };
}

function getNextStep(stepId: EditorOnboardingStepId) {
  const index = editorOnboardingSteps.findIndex(({ id }) => id === stepId);
  return editorOnboardingSteps[index + 1]?.id;
}

async function terminateRun(
  transaction: Parameters<
    Parameters<typeof withEditorOnboardingUserLock>[1]
  >[0],
  run: EditorOnboardingRun,
  status: "completed" | "dismissed",
) {
  const resumeId = run.resumeId;
  const updated = await updateEditorOnboardingRun(
    transaction,
    run.userId,
    run.id,
    {
      resumeId: null,
      status,
      completedAt: new Date(),
    },
  );
  if (resumeId) {
    await deleteOwnedOnboardingResume(transaction, run.userId, resumeId);
  }
  return updated!;
}

async function ensureActiveRunResume(
  transaction: Parameters<
    Parameters<typeof withEditorOnboardingUserLock>[1]
  >[0],
  run: EditorOnboardingRun,
  locale: AppLocale,
) {
  if (
    run.resumeId &&
    (await getOwnedOnboardingResumeDocument(transaction, run.userId, run.resumeId))
  ) {
    return run;
  }

  const resumeId = await createEditorOnboardingResume(
    transaction,
    run.userId,
    locale,
  );
  return (await updateEditorOnboardingRun(
    transaction,
    run.userId,
    run.id,
    { resumeId, currentStep: FIRST_STEP },
  ))!;
}

async function prepareDevelopmentEntry(input: {
  userId: string;
  sessionId: string;
  locale: AppLocale;
}): Promise<EditorOnboardingEntryDecision> {
  const triggerKey = createDevelopmentTrigger(input.sessionId);

  return withEditorOnboardingUserLock(input.userId, async (transaction) => {
    const sameSession = await findEditorOnboardingRunByTrigger(
      transaction,
      input.userId,
      triggerKey,
    );
    if (sameSession) {
      if (sameSession.status === "active" || sameSession.status === "paused") {
        const run = await ensureActiveRunResume(
          transaction,
          sameSession,
          input.locale,
        );
        await deleteOrphanedOnboardingResumes(
          transaction,
          input.userId,
          run.resumeId ? [run.resumeId] : [],
        );
        return createAvailableRunDecision(run);
      }
      return { run: sameSession };
    }

    const active = await findActiveEditorOnboardingRun(transaction, input.userId);
    if (active) {
      await terminateRun(transaction, active, "dismissed");
    }
    await deleteOrphanedOnboardingResumes(transaction, input.userId, []);

    const resumeId = await createEditorOnboardingResume(
      transaction,
      input.userId,
      input.locale,
    );
    const run = await insertEditorOnboardingRun(transaction, {
      userId: input.userId,
      flowKey: EDITOR_BASICS_FLOW_KEY,
      flowVersion: EDITOR_BASICS_FLOW_VERSION,
      source: "development",
      triggerKey,
      resumeId,
      status: "active",
      currentStep: FIRST_STEP,
    });
    return { run, promptHref: createEditorHref(resumeId) };
  });
}

async function prepareProductionEntry(input: {
  userId: string;
  locale: AppLocale;
}): Promise<EditorOnboardingEntryDecision> {
  return withEditorOnboardingUserLock(input.userId, async (transaction) => {
    const existing = await findLatestEditorOnboardingRun(
      transaction,
      input.userId,
      EDITOR_BASICS_FLOW_KEY,
      EDITOR_BASICS_FLOW_VERSION,
    );
    if (existing) {
      if (existing.status === "active" || existing.status === "paused") {
        const run = await ensureActiveRunResume(
          transaction,
          existing,
          input.locale,
        );
        await deleteOrphanedOnboardingResumes(
          transaction,
          input.userId,
          run.resumeId ? [run.resumeId] : [],
        );
        return createAvailableRunDecision(run);
      }
      await deleteOrphanedOnboardingResumes(transaction, input.userId, []);
      return { run: existing };
    }

    if ((await countStandardResumes(transaction, input.userId)) > 0) {
      const run = await insertEditorOnboardingRun(transaction, {
        userId: input.userId,
        flowKey: EDITOR_BASICS_FLOW_KEY,
        flowVersion: EDITOR_BASICS_FLOW_VERSION,
        source: "automatic",
        triggerKey: PRODUCTION_TRIGGER,
        status: "ineligible",
        currentStep: FIRST_STEP,
      });
      await deleteOrphanedOnboardingResumes(transaction, input.userId, []);
      return { run };
    }

    await deleteOrphanedOnboardingResumes(transaction, input.userId, []);
    const resumeId = await createEditorOnboardingResume(
      transaction,
      input.userId,
      input.locale,
    );
    const run = await insertEditorOnboardingRun(transaction, {
      userId: input.userId,
      flowKey: EDITOR_BASICS_FLOW_KEY,
      flowVersion: EDITOR_BASICS_FLOW_VERSION,
      source: "automatic",
      triggerKey: PRODUCTION_TRIGGER,
      resumeId,
      status: "active",
      currentStep: FIRST_STEP,
    });
    return { run, promptHref: createEditorHref(resumeId) };
  });
}

export async function prepareEditorOnboardingEntry(input: {
  userId: string;
  sessionId: string;
  locale: AppLocale;
}) {
  return readNodeEnvironment() === "development"
    ? prepareDevelopmentEntry(input)
    : prepareProductionEntry(input);
}

export async function restartEditorOnboarding(input: {
  userId: string;
  locale: AppLocale;
}) {
  return withEditorOnboardingUserLock(input.userId, async (transaction) => {
    const active = await findActiveEditorOnboardingRun(transaction, input.userId);
    if (active) {
      await terminateRun(transaction, active, "dismissed");
    }
    await deleteOrphanedOnboardingResumes(transaction, input.userId, []);
    const resumeId = await createEditorOnboardingResume(
      transaction,
      input.userId,
      input.locale,
    );
    return insertEditorOnboardingRun(transaction, {
      userId: input.userId,
      flowKey: EDITOR_BASICS_FLOW_KEY,
      flowVersion: EDITOR_BASICS_FLOW_VERSION,
      source: "manual",
      triggerKey: `${EDITOR_BASICS_FLOW_KEY}:v${EDITOR_BASICS_FLOW_VERSION}:manual:${randomUUID()}`,
      resumeId,
      status: "active",
      currentStep: FIRST_STEP,
    });
  });
}

export async function transitionEditorOnboarding(input: {
  userId: string;
  runId: string;
  action: EditorOnboardingTransitionAction;
}) {
  return withEditorOnboardingUserLock(input.userId, async (transaction) => {
    const run = await findEditorOnboardingRunById(
      transaction,
      input.userId,
      input.runId,
    );
    if (!run) throw new EditorOnboardingTransitionError();

    if (input.action.type === "start") {
      if (run.status !== "active" || !run.resumeId) {
        throw new EditorOnboardingTransitionError();
      }
      if (run.autoOpenedAt) return run;
      return (await updateEditorOnboardingRun(
        transaction,
        input.userId,
        run.id,
        { autoOpenedAt: new Date() },
      ))!;
    }

    if (input.action.type === "pause") {
      if (run.status !== "active") throw new EditorOnboardingTransitionError();
      return (await updateEditorOnboardingRun(
        transaction,
        input.userId,
        run.id,
        { status: "paused" },
      ))!;
    }

    if (input.action.type === "resume") {
      if (run.status !== "paused") throw new EditorOnboardingTransitionError();
      return (await updateEditorOnboardingRun(
        transaction,
        input.userId,
        run.id,
        { status: "active" },
      ))!;
    }

    if (input.action.type === "dismiss") {
      if (run.status !== "active" && run.status !== "paused") {
        throw new EditorOnboardingTransitionError();
      }
      return terminateRun(transaction, run, "dismissed");
    }

    if (input.action.type === "complete") {
      if (run.status !== "active" || run.currentStep !== "output-overview") {
        throw new EditorOnboardingTransitionError();
      }
      return terminateRun(transaction, run, "completed");
    }

    if (
      run.status !== "active" ||
      run.currentStep !== input.action.stepId ||
      !run.resumeId
    ) {
      throw new EditorOnboardingTransitionError();
    }

    const definition = getEditorOnboardingStep(input.action.stepId);
    const nextStep = getNextStep(input.action.stepId);
    if (!definition || !nextStep) {
      throw new EditorOnboardingTransitionError();
    }

    if (input.action.type === "complete-step") {
      if (definition.completion === "preview-route") {
        throw new EditorOnboardingTransitionError();
      }

      if (definition.completion === "persisted-document") {
        const document = await getOwnedOnboardingResumeDocument(
          transaction,
          input.userId,
          run.resumeId,
        );
        if (
          !document ||
          !evaluateEditorOnboardingDocumentStep(input.action.stepId, document)
        ) {
          throw new EditorOnboardingTransitionError();
        }
      }
    }

    return (await updateEditorOnboardingRun(
      transaction,
      input.userId,
      run.id,
      { currentStep: nextStep },
    ))!;
  });
}

export async function markEditorOnboardingPreviewVisited(input: {
  userId: string;
  resumeId: string;
}) {
  await withEditorOnboardingUserLock(input.userId, async (transaction) => {
    const active = await findActiveEditorOnboardingRun(transaction, input.userId);
    if (
      !active ||
      active.status !== "active" ||
      active.resumeId !== input.resumeId ||
      active.currentStep !== "preview"
    ) {
      return;
    }
    await updateEditorOnboardingRun(
      transaction,
      input.userId,
      active.id,
      { currentStep: "output-overview" },
    );
  });
}

export type {
  EditorOnboardingEntryDecision,
  EditorOnboardingRun,
  EditorOnboardingSource,
  EditorOnboardingStatus,
  EditorOnboardingTransitionAction,
} from "./types";
