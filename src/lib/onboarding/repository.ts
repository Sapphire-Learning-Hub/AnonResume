import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db, onboardingRuns, resumes } from "@/db";
import type { EditorOnboardingStepId } from "@/domain/onboarding/editor-basics";
import { createEditorOnboardingDocument } from "@/domain/onboarding/editor-basics-document";
import { validateResumeDocument } from "@/domain/resume/validation";
import type { AppLocale } from "@/i18n/messages";
import { createResumeId } from "@/lib/resume/catalog";
import { buildResumeSummary } from "@/lib/resume/repository";

import type {
  EditorOnboardingRun,
  EditorOnboardingSource,
  EditorOnboardingStatus,
} from "./types";

type OnboardingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OnboardingRunRow = typeof onboardingRuns.$inferSelect;

const ONBOARDING_USER_LOCK_PREFIX = "anonresume:editor-onboarding:";

function mapRun(row: OnboardingRunRow): EditorOnboardingRun {
  return {
    id: row.id,
    userId: row.userId,
    flowKey: row.flowKey,
    flowVersion: row.flowVersion,
    source: row.source,
    ...(row.resumeId ? { resumeId: row.resumeId } : {}),
    status: row.status,
    currentStep: row.currentStep as EditorOnboardingStepId,
    ...(row.autoOpenedAt
      ? { autoOpenedAt: row.autoOpenedAt.getTime() }
      : {}),
    ...(row.completedAt ? { completedAt: row.completedAt.getTime() } : {}),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function withEditorOnboardingUserLock<T>(
  userId: string,
  callback: (transaction: OnboardingTransaction) => Promise<T>,
) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${ONBOARDING_USER_LOCK_PREFIX}${userId}`}))`,
    );
    return callback(transaction);
  });
}

export async function findEditorOnboardingRunByTrigger(
  transaction: OnboardingTransaction,
  userId: string,
  triggerKey: string,
) {
  const [row] = await transaction
    .select()
    .from(onboardingRuns)
    .where(
      and(
        eq(onboardingRuns.userId, userId),
        eq(onboardingRuns.triggerKey, triggerKey),
      ),
    )
    .limit(1);
  return row ? mapRun(row) : undefined;
}

export async function findLatestEditorOnboardingRun(
  transaction: OnboardingTransaction,
  userId: string,
  flowKey: string,
  flowVersion: number,
) {
  const [row] = await transaction
    .select()
    .from(onboardingRuns)
    .where(
      and(
        eq(onboardingRuns.userId, userId),
        eq(onboardingRuns.flowKey, flowKey),
        eq(onboardingRuns.flowVersion, flowVersion),
      ),
    )
    .orderBy(desc(onboardingRuns.createdAt), desc(onboardingRuns.id))
    .limit(1);
  return row ? mapRun(row) : undefined;
}

export async function findEditorOnboardingRunById(
  transaction: OnboardingTransaction,
  userId: string,
  runId: string,
) {
  const [row] = await transaction
    .select()
    .from(onboardingRuns)
    .where(
      and(eq(onboardingRuns.userId, userId), eq(onboardingRuns.id, runId)),
    )
    .limit(1);
  return row ? mapRun(row) : undefined;
}

export async function findActiveEditorOnboardingRun(
  transaction: OnboardingTransaction,
  userId: string,
) {
  const [row] = await transaction
    .select()
    .from(onboardingRuns)
    .where(
      and(
        eq(onboardingRuns.userId, userId),
        inArray(onboardingRuns.status, ["active", "paused"]),
      ),
    )
    .limit(1);
  return row ? mapRun(row) : undefined;
}

export async function insertEditorOnboardingRun(
  transaction: OnboardingTransaction,
  input: {
    id?: string;
    userId: string;
    flowKey: string;
    flowVersion: number;
    source: EditorOnboardingSource;
    triggerKey: string;
    resumeId?: string;
    status: EditorOnboardingStatus;
    currentStep: EditorOnboardingStepId;
    autoOpenedAt?: Date;
  },
) {
  const [row] = await transaction
    .insert(onboardingRuns)
    .values({
      id: input.id ?? randomUUID(),
      userId: input.userId,
      flowKey: input.flowKey,
      flowVersion: input.flowVersion,
      source: input.source,
      triggerKey: input.triggerKey,
      resumeId: input.resumeId ?? null,
      status: input.status,
      currentStep: input.currentStep,
      autoOpenedAt: input.autoOpenedAt ?? null,
    })
    .returning();
  return mapRun(row!);
}

export async function updateEditorOnboardingRun(
  transaction: OnboardingTransaction,
  userId: string,
  runId: string,
  values: {
    resumeId?: string | null;
    status?: EditorOnboardingStatus;
    currentStep?: EditorOnboardingStepId;
    autoOpenedAt?: Date | null;
    completedAt?: Date | null;
  },
) {
  const [row] = await transaction
    .update(onboardingRuns)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(eq(onboardingRuns.userId, userId), eq(onboardingRuns.id, runId)),
    )
    .returning();
  return row ? mapRun(row) : undefined;
}

export async function countStandardResumes(
  transaction: OnboardingTransaction,
  userId: string,
) {
  const rows = await transaction
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.kind, "standard")))
    .limit(1);
  return rows.length;
}

export async function createEditorOnboardingResume(
  transaction: OnboardingTransaction,
  userId: string,
  locale: AppLocale,
) {
  const document = createEditorOnboardingDocument(locale);
  const id = createResumeId();
  const [row] = await transaction
    .insert(resumes)
    .values({
      id,
      userId,
      kind: "onboarding",
      name: document.meta.title,
      summary: buildResumeSummary({ document, summary: "" }),
      document,
    })
    .returning({ id: resumes.id });
  return row!.id;
}

export async function getOwnedOnboardingResumeDocument(
  transaction: OnboardingTransaction,
  userId: string,
  resumeId: string,
) {
  const [row] = await transaction
    .select({ document: resumes.document })
    .from(resumes)
    .where(
      and(
        eq(resumes.userId, userId),
        eq(resumes.id, resumeId),
        eq(resumes.kind, "onboarding"),
      ),
    )
    .limit(1);
  return row ? validateResumeDocument(row.document) : undefined;
}

export async function deleteOwnedOnboardingResume(
  transaction: OnboardingTransaction,
  userId: string,
  resumeId: string,
) {
  await transaction
    .delete(resumes)
    .where(
      and(
        eq(resumes.userId, userId),
        eq(resumes.id, resumeId),
        eq(resumes.kind, "onboarding"),
      ),
    );
}

export async function deleteOrphanedOnboardingResumes(
  transaction: OnboardingTransaction,
  userId: string,
  retainedResumeIds: readonly string[],
) {
  const ownership = and(
    eq(resumes.userId, userId),
    eq(resumes.kind, "onboarding"),
  );
  await transaction
    .delete(resumes)
    .where(
      retainedResumeIds.length > 0
        ? and(ownership, notInArray(resumes.id, [...retainedResumeIds]))
        : ownership,
    );
}

export async function getEditorOnboardingRunForResume(
  userId: string,
  resumeId: string,
) {
  const [row] = await db
    .select()
    .from(onboardingRuns)
    .where(
      and(
        eq(onboardingRuns.userId, userId),
        eq(onboardingRuns.resumeId, resumeId),
        inArray(onboardingRuns.status, ["active", "paused"]),
      ),
    )
    .limit(1);
  return row ? mapRun(row) : undefined;
}

export async function resetEditorOnboardingRepository(options?: {
  userId?: string;
}) {
  if (options?.userId) {
    await db
      .delete(onboardingRuns)
      .where(eq(onboardingRuns.userId, options.userId));
    await db
      .delete(resumes)
      .where(
        and(
          eq(resumes.userId, options.userId),
          eq(resumes.kind, "onboarding"),
        ),
      );
    return;
  }

  await db.delete(onboardingRuns);
  await db.delete(resumes).where(eq(resumes.kind, "onboarding"));
}
