import { and, count, desc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { db, resumes } from "@/db";
import { assertAccountMergeMutationAllowed } from "@/lib/auth/account/merge/executor";
import {
  deleteResumeRecord,
  lockOwnedResume,
  ResumeNotFoundError,
} from "@/lib/resume/repository";
import { databaseNow } from "@/lib/resume/transaction";
import {
  createPageResult,
  resolvePage,
  type PageRequest,
  type PageResult,
} from "@/lib/shared/pagination";
import type { ResumeCatalogEntry } from "@/lib/resume/catalog";
import { ResumeTrashBusyError, ResumeTrashExpiredError } from "./errors";
import { hasUnfinishedResumeTasks } from "./tasks";
import type { ResumeTrashEntry } from "./types";

export async function moveResumeToTrash(input: {
  userId: string;
  resumeId: string;
}) {
  await assertAccountMergeMutationAllowed(input.userId);
  const row = await deleteResumeRecord(input.userId, input.resumeId);
  return {
    id: row.id,
    title: row.name,
    version: row.version,
    deletedAt: row.deletedAt!.getTime(),
    purgeAfter: row.purgeAfter!.getTime(),
    recoverable: true,
  } satisfies ResumeTrashEntry;
}

export async function restoreTrashedResume(input: {
  userId: string;
  resumeId: string;
}): Promise<ResumeCatalogEntry> {
  await assertAccountMergeMutationAllowed(input.userId);
  return db.transaction(async (transaction) => {
    const row = await lockOwnedResume(
      transaction,
      input.userId,
      input.resumeId,
    );
    if (!row.deletedAt || !row.purgeAfter)
      throw new ResumeNotFoundError(input.resumeId);
    if (row.purgeAfter <= (await databaseNow(transaction)))
      throw new ResumeTrashExpiredError();
    const [restored] = await transaction
      .update(resumes)
      .set({
        deletedAt: null,
        purgeAfter: null,
        published: false,
        version: sql`${resumes.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(resumes.userId, input.userId), eq(resumes.id, input.resumeId)),
      )
      .returning();
    return {
      id: restored!.id,
      title: restored!.name,
      summary: restored!.customSummary ?? restored!.summary,
      version: restored!.version,
      updatedAt: restored!.updatedAt.getTime(),
      published: false,
      slug: restored!.slug ?? undefined,
    };
  });
}

export async function purgeTrashedResume(input: {
  userId: string;
  resumeId: string;
}) {
  await assertAccountMergeMutationAllowed(input.userId);
  return db.transaction(async (transaction) => {
    const row = await lockOwnedResume(
      transaction,
      input.userId,
      input.resumeId,
    );
    if (!row.deletedAt) throw new ResumeNotFoundError(input.resumeId);
    if (
      await hasUnfinishedResumeTasks(transaction, input.userId, input.resumeId)
    )
      throw new ResumeTrashBusyError();
    await transaction
      .delete(resumes)
      .where(
        and(eq(resumes.userId, input.userId), eq(resumes.id, input.resumeId)),
      );
  });
}

export async function paginateTrashedResumes(
  input: PageRequest & { userId: string; query?: string },
): Promise<PageResult<ResumeTrashEntry>> {
  const query = input.query?.trim().slice(0, 100);
  const filter = and(
    eq(resumes.userId, input.userId),
    eq(resumes.kind, "standard"),
    isNotNull(resumes.deletedAt),
    query ? ilike(resumes.name, `%${query}%`) : undefined,
  );
  const [totalRow] = await db
    .select({ value: count() })
    .from(resumes)
    .where(filter);
  const total = totalRow?.value ?? 0;
  const page = resolvePage(total, input);
  const rows = await db
    .select({
      id: resumes.id,
      title: resumes.name,
      version: resumes.version,
      deletedAt: resumes.deletedAt,
      purgeAfter: resumes.purgeAfter,
      recoverable: sql<boolean>`${resumes.purgeAfter} > now()`,
    })
    .from(resumes)
    .where(filter)
    .orderBy(desc(resumes.deletedAt), desc(resumes.id))
    .limit(input.pageSize)
    .offset(page.offset);
  return createPageResult(
    rows.map((row) => ({
      ...row,
      deletedAt: row.deletedAt!.getTime(),
      purgeAfter: row.purgeAfter!.getTime(),
    })),
    total,
    input,
  );
}
