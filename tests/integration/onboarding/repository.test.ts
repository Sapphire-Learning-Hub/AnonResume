import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, onboardingRuns, resumes } from "@/db";
import { createEditorOnboardingDocument } from "@/domain/onboarding/editor-basics-document";
import { createOnboardingResumeRecord } from "@/lib/resume/repository";
import {
  getEditorOnboardingRunForResume,
  resetEditorOnboardingRepository,
} from "@/lib/onboarding/repository";
import { prepareEditorOnboardingEntry } from "@/lib/onboarding/service";

describe("editor onboarding repository", () => {
  const userIds: string[] = [];

  function createUserId(label: string) {
    const userId = `onboarding-repository-${label}-${randomUUID()}`;
    userIds.push(userId);
    return userId;
  }

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await db.delete(onboardingRuns).where(eq(onboardingRuns.userId, userId));
      await db.delete(resumes).where(eq(resumes.userId, userId));
    }
  });

  it("returns only the owner-scoped run associated with a practice resume", async () => {
    const ownerId = createUserId("owner");
    const otherUserId = createUserId("other");
    const decision = await prepareEditorOnboardingEntry({
      userId: ownerId,
      sessionId: randomUUID(),
      locale: "zh-CN",
    });

    expect(decision.run?.resumeId).toBeTruthy();
    await expect(
      getEditorOnboardingRunForResume(ownerId, decision.run!.resumeId!),
    ).resolves.toEqual(expect.objectContaining({ id: decision.run!.id }));
    await expect(
      getEditorOnboardingRunForResume(otherUserId, decision.run!.resumeId!),
    ).resolves.toBeUndefined();
  });

  it("resets onboarding rows and practice resumes without removing standard resumes", async () => {
    const userId = createUserId("reset");
    const standardId = `standard-${randomUUID()}`;
    const practice = await createOnboardingResumeRecord({
      userId,
      locale: "zh-CN",
      document: createEditorOnboardingDocument("zh-CN"),
    });
    await db.insert(resumes).values({
      id: standardId,
      userId,
      kind: "standard",
      name: "Standard",
      summary: "",
      document: createEditorOnboardingDocument("zh-CN"),
    });

    await resetEditorOnboardingRepository({ userId });

    const remaining = await db
      .select({ id: resumes.id, kind: resumes.kind })
      .from(resumes)
      .where(and(eq(resumes.userId, userId), eq(resumes.id, standardId)));
    expect(remaining).toEqual([{ id: standardId, kind: "standard" }]);
    await expect(
      db
        .select({ id: resumes.id })
        .from(resumes)
        .where(eq(resumes.id, practice.id)),
    ).resolves.toHaveLength(0);
  });
});
