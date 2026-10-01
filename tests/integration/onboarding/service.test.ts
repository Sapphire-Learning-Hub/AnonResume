import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db, onboardingRuns, resumes } from "@/db";
import { ONBOARDING_EDIT_BLOCK_ID } from "@/domain/onboarding/editor-basics-document";
import type { ResumeDocument } from "@/domain/resume/schema";
import {
  createResumeRecord,
  deleteResumeRecord,
  getResumeRecord,
  saveResumeRecord,
} from "@/lib/resume/repository";
import {
  EditorOnboardingTransitionError,
  markEditorOnboardingPreviewVisited,
  prepareEditorOnboardingEntry,
  restartEditorOnboarding,
  transitionEditorOnboarding,
} from "@/lib/onboarding/service";

function changePracticeText(document: ResumeDocument) {
  const changed = structuredClone(document);
  const target = changed.sections
    .flatMap(({ blocks }) => blocks)
    .find(({ id }) => id === ONBOARDING_EDIT_BLOCK_ID);

  if (!target || target.type !== "text") {
    throw new Error("Missing onboarding target");
  }

  target.content.content[0]!.content = [
    { type: "text", text: "已完成实际编辑" },
  ];
  return changed;
}

describe("editor onboarding lifecycle", () => {
  const userIds: string[] = [];

  function createUserId(label: string) {
    const userId = `onboarding-service-${label}-${randomUUID()}`;
    userIds.push(userId);
    return userId;
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const userId of userIds.splice(0)) {
      await db.delete(onboardingRuns).where(eq(onboardingRuns.userId, userId));
      await db.delete(resumes).where(eq(resumes.userId, userId));
    }
  });

  it("automatically creates and opens one practice resume for a new user", async () => {
    const userId = createUserId("new");
    const decision = await prepareEditorOnboardingEntry({
      userId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });

    expect(decision.autoOpenHref).toBe(`/app/resumes/${decision.run?.resumeId}`);
    expect(decision.continueHref).toBeUndefined();
    expect(decision.run).toEqual(
      expect.objectContaining({
        userId,
        source: "automatic",
        status: "active",
        currentStep: "canvas-intro",
      }),
    );
  });

  it("records existing resume users as ineligible and never reconsiders them", async () => {
    const userId = createUserId("existing");
    const resumeId = `standard-${randomUUID()}`;
    await createResumeRecord(userId, resumeId, "zh-CN");

    const first = await prepareEditorOnboardingEntry({
      userId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });
    expect(first.run).toEqual(expect.objectContaining({ status: "ineligible" }));
    expect(first.run).not.toHaveProperty("resumeId");
    expect(first.autoOpenHref).toBeUndefined();

    await deleteResumeRecord(userId, resumeId);
    const second = await prepareEditorOnboardingEntry({
      userId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });
    expect(second.run?.id).toBe(first.run?.id);
    expect(second.run?.status).toBe("ineligible");
  });

  it("serializes concurrent production entry and creates one run and resume", async () => {
    const userId = createUserId("concurrent");
    const [first, second] = await Promise.all([
      prepareEditorOnboardingEntry({
        userId,
        sessionId: randomUUID(),
        locale: "zh-CN",
      }),
      prepareEditorOnboardingEntry({
        userId,
        sessionId: randomUUID(),
        locale: "zh-CN",
      }),
    ]);

    expect(first.run?.id).toBe(second.run?.id);
    expect([first.autoOpenHref, second.autoOpenHref].filter(Boolean)).toHaveLength(1);
    await expect(
      db.select().from(onboardingRuns).where(eq(onboardingRuns.userId, userId)),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select()
        .from(resumes)
        .where(and(eq(resumes.userId, userId), eq(resumes.kind, "onboarding"))),
    ).resolves.toHaveLength(1);
  });

  it("keeps development entry idempotent within a session and replaces it for a new session", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const userId = createUserId("development");
    const first = await prepareEditorOnboardingEntry({
      userId,
      sessionId: "session-one",
      locale: "en-US",
    });
    const refresh = await prepareEditorOnboardingEntry({
      userId,
      sessionId: "session-one",
      locale: "en-US",
    });
    const nextSession = await prepareEditorOnboardingEntry({
      userId,
      sessionId: "session-two",
      locale: "en-US",
    });

    expect(refresh.run?.id).toBe(first.run?.id);
    expect(nextSession.run?.id).not.toBe(first.run?.id);
    expect(await getResumeRecord(userId, first.run!.resumeId!)).toBeUndefined();
    expect(await getResumeRecord(userId, nextSession.run!.resumeId!)).toBeDefined();
    const oldRows = await db
      .select({ status: onboardingRuns.status, resumeId: onboardingRuns.resumeId })
      .from(onboardingRuns)
      .where(eq(onboardingRuns.id, first.run!.id));
    expect(oldRows).toEqual([{ status: "dismissed", resumeId: null }]);
  });

  it("recreates missing practice data only for an active run", async () => {
    const userId = createUserId("repair");
    const first = await prepareEditorOnboardingEntry({
      userId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });
    await db.delete(resumes).where(eq(resumes.id, first.run!.resumeId!));

    const repaired = await prepareEditorOnboardingEntry({
      userId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });

    expect(repaired.run?.id).toBe(first.run?.id);
    expect(repaired.run?.resumeId).not.toBe(first.run?.resumeId);
    expect(await getResumeRecord(userId, repaired.run!.resumeId!)).toBeDefined();
  });

  it("cleans only the owner's orphaned practice resumes", async () => {
    const ownerId = createUserId("cleanup-owner");
    const otherId = createUserId("cleanup-other");
    const ownerOrphanId = `owner-orphan-${randomUUID()}`;
    const otherOrphanId = `other-orphan-${randomUUID()}`;
    const document = (await createResumeRecord(ownerId, `temp-${randomUUID()}`))
      .document;
    await db.delete(resumes).where(eq(resumes.userId, ownerId));
    await db.insert(resumes).values([
      {
        id: ownerOrphanId,
        userId: ownerId,
        kind: "onboarding",
        name: "Owner orphan",
        summary: "",
        document,
      },
      {
        id: otherOrphanId,
        userId: otherId,
        kind: "onboarding",
        name: "Other orphan",
        summary: "",
        document,
      },
    ]);

    await prepareEditorOnboardingEntry({
      userId: ownerId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });

    expect(await getResumeRecord(ownerId, ownerOrphanId)).toBeUndefined();
    expect(await getResumeRecord(otherId, otherOrphanId)).toBeDefined();
  });

  it("cleans practice data on terminal transitions while preserving run history", async () => {
    const userId = createUserId("terminal");
    const decision = await prepareEditorOnboardingEntry({
      userId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });
    const resumeId = decision.run!.resumeId!;

    const dismissed = await transitionEditorOnboarding({
      userId,
      runId: decision.run!.id,
      action: { type: "dismiss" },
    });

    expect(dismissed).toEqual(expect.objectContaining({ status: "dismissed" }));
    expect(dismissed).not.toHaveProperty("resumeId");
    expect(await getResumeRecord(userId, resumeId)).toBeUndefined();
    await expect(
      db.select().from(onboardingRuns).where(eq(onboardingRuns.id, dismissed.id)),
    ).resolves.toHaveLength(1);
  });

  it("rejects cross-user, non-adjacent, and unsupported completion transitions", async () => {
    const userId = createUserId("transition-owner");
    const otherId = createUserId("transition-other");
    const decision = await prepareEditorOnboardingEntry({
      userId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });

    await expect(
      transitionEditorOnboarding({
        userId: otherId,
        runId: decision.run!.id,
        action: { type: "pause" },
      }),
    ).rejects.toBeInstanceOf(EditorOnboardingTransitionError);
    await expect(
      transitionEditorOnboarding({
        userId,
        runId: decision.run!.id,
        action: { type: "complete-step", stepId: "format-text" },
      }),
    ).rejects.toBeInstanceOf(EditorOnboardingTransitionError);

    const editStep = await transitionEditorOnboarding({
      userId,
      runId: decision.run!.id,
      action: { type: "complete-step", stepId: "canvas-intro" },
    });
    await expect(
      transitionEditorOnboarding({
        userId,
        runId: editStep.id,
        action: { type: "complete-step", stepId: "edit-text" },
      }),
    ).rejects.toBeInstanceOf(EditorOnboardingTransitionError);
  });

  it("validates saved document evidence and preview visits before advancing", async () => {
    const userId = createUserId("evidence");
    const decision = await prepareEditorOnboardingEntry({
      userId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });
    let run = await transitionEditorOnboarding({
      userId,
      runId: decision.run!.id,
      action: { type: "complete-step", stepId: "canvas-intro" },
    });
    const resume = await getResumeRecord(userId, run.resumeId!);
    const saved = await saveResumeRecord({
      userId,
      resumeId: resume!.id,
      version: resume!.version,
      document: changePracticeText(resume!.document),
    });

    run = await transitionEditorOnboarding({
      userId,
      runId: run.id,
      action: { type: "complete-step", stepId: "edit-text" },
    });
    expect(run.currentStep).toBe("format-text");

    for (const stepId of [
      "format-text",
      "insert-content",
      "change-design",
      "reorder-content",
    ] as const) {
      run = await transitionEditorOnboarding({
        userId,
        runId: run.id,
        action: { type: "skip-step", stepId },
      });
    }
    expect(run.currentStep).toBe("preview");

    await markEditorOnboardingPreviewVisited({ userId, resumeId: saved.id });
    const rows = await db
      .select({ currentStep: onboardingRuns.currentStep })
      .from(onboardingRuns)
      .where(eq(onboardingRuns.id, run.id));
    expect(rows).toEqual([{ currentStep: "output-overview" }]);
  });

  it("manually restarts by replacing the active practice run", async () => {
    const userId = createUserId("restart");
    const first = await prepareEditorOnboardingEntry({
      userId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });
    const restarted = await restartEditorOnboarding({ userId, locale: "en-US" });

    expect(restarted.id).not.toBe(first.run?.id);
    expect(restarted.source).toBe("manual");
    expect(restarted.currentStep).toBe("canvas-intro");
    expect(await getResumeRecord(userId, first.run!.resumeId!)).toBeUndefined();
  });
});
