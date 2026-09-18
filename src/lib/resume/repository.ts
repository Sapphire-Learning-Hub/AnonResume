import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { resumes, resumeVersions } from "@/db/schema";
import { getPlainTextFromRichText } from "@/domain/resume/operations";
import type { ResumeBlock, ResumeDocument } from "@/domain/resume/schema";
import {
  createResumeDocumentFromTemplate,
  type ResumeTemplateId,
} from "@/domain/resume/templates";
import { validateResumeDocument } from "@/domain/resume/validation";
import { defaultLocale, type AppLocale } from "@/i18n/messages";
import {
  createPageResult,
  resolvePage,
  type PageRequest,
  type PageResult,
} from "@/lib/shared/pagination";

import {
  createResumeId,
  createLocalResumeRecord,
  type ResumeCatalogEntry,
  type ResumeRecord,
} from "@/lib/resume/catalog";

const LEGACY_USER_ID = "__legacy_single_user__";
export const RESUME_SCHEMA_VERSION = 1;
const CATALOG_SUMMARY_MAX_LENGTH = 160;
const GENERATED_RESUME_ID_MAX_ATTEMPTS = 3;
const DEFAULT_RESUME_VERSION_HISTORY_LIMIT = 5;

type ResumeRow = typeof resumes.$inferSelect;
type ResumeVersionRow = typeof resumeVersions.$inferSelect;

export interface ResumeVersionSnapshot {
  id: string;
  userId: string;
  resumeId: string;
  version: number;
  document: ResumeRecord["document"];
  createdAt: number;
}

export class ResumeVersionConflictError extends Error {
  currentVersion: number;

  constructor(currentVersion: number) {
    super("Resume version conflict");
    this.name = "ResumeVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export class ResumeNotFoundError extends Error {
  constructor(resumeId: string) {
    super(`Resume not found: ${resumeId}`);
    this.name = "ResumeNotFoundError";
  }
}

export class ResumeIdentifierConflictError extends Error {
  resumeId: string;

  constructor(resumeId: string) {
    super(`Resume identifier is already in use: ${resumeId}`);
    this.name = "ResumeIdentifierConflictError";
    this.resumeId = resumeId;
  }
}

export class ResumeVersionSnapshotNotFoundError extends Error {
  constructor(snapshotId: string) {
    super(`Resume version snapshot not found: ${snapshotId}`);
    this.name = "ResumeVersionSnapshotNotFoundError";
  }
}

function normalizeSummaryText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatCatalogSummary(value: string) {
  const normalized = normalizeSummaryText(value);

  if (normalized.length <= CATALOG_SUMMARY_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, CATALOG_SUMMARY_MAX_LENGTH - 3).trimEnd()}...`;
}

function getFirstBlockSummary(blocks: ResumeBlock[]): string | undefined {
  for (const block of blocks) {
    if (block.type === "text") {
      const summary = normalizeSummaryText(getPlainTextFromRichText(block.content));

      if (summary) {
        return summary;
      }

      continue;
    }

    if (block.type === "badges") {
      const summary = normalizeSummaryText(
        block.items.map((item) => item.text).join(", "),
      );

      if (summary) {
        return summary;
      }

      continue;
    }

    if (block.type === "list") {
      for (const item of block.items) {
        const summary = getFirstBlockSummary(item.children);

        if (summary) {
          return summary;
        }
      }

      continue;
    }

    const summary = getFirstBlockSummary(block.children);

    if (summary) {
      return summary;
    }
  }

  return undefined;
}

export function buildResumeSummary(
  record: Pick<ResumeRecord, "document" | "summary">,
) {
  const visibleSections = record.document.sections.filter((section) => section.visible);

  for (const section of visibleSections) {
    const summary = getFirstBlockSummary(section.blocks);

    if (summary) {
      return formatCatalogSummary(summary);
    }
  }

  for (const section of visibleSections) {
    const title = section.title
      ? normalizeSummaryText(getPlainTextFromRichText(section.title))
      : "";

    if (title) {
      return formatCatalogSummary(title);
    }
  }

  return formatCatalogSummary(record.summary);
}

function resolveSummary(record: {
  customSummary?: string | null;
  document: ResumeDocument;
  summary: string;
}) {
  return record.customSummary
    ? formatCatalogSummary(record.customSummary)
    : buildResumeSummary(record);
}

function mapResumeRow(row: ResumeRow): ResumeRecord {
  const document = validateResumeDocument(row.document);

  return {
    id: row.id,
    userId: row.userId,
    title: row.name,
    summary: resolveSummary({
      customSummary: row.customSummary,
      document,
      summary: row.summary,
    }),
    customSummary: row.customSummary ?? undefined,
    document,
    version: row.version,
    updatedAt: row.updatedAt.getTime(),
    published: row.published,
    slug: row.slug ?? undefined,
  };
}

function mapResumeVersionRow(row: ResumeVersionRow): ResumeVersionSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    resumeId: row.resumeId,
    version: row.version,
    document: validateResumeDocument(row.document),
    createdAt: row.createdAt.getTime(),
  };
}

async function insertResumeRecord(record: ResumeRecord) {
  const inserted = await db
    .insert(resumes)
    .values({
      id: record.id,
      userId: record.userId,
      name: record.title,
      summary: record.summary,
      customSummary: record.customSummary ?? null,
      slug: record.slug ?? null,
      document: record.document,
      schemaVersion: RESUME_SCHEMA_VERSION,
      version: record.version,
      published: record.published,
      createdAt: new Date(record.updatedAt),
      updatedAt: new Date(record.updatedAt),
    })
    .onConflictDoNothing()
    .returning({ id: resumes.id });

  return inserted.length > 0;
}

async function selectResumeRecord(userId: string, resumeId: string) {
  const rows = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.id, resumeId)))
    .limit(1);

  return rows[0] ? mapResumeRow(rows[0]) : undefined;
}

async function ensureResumeRecord(
  userId: string,
  resumeId: string,
  locale: AppLocale = defaultLocale,
) {
  const existing = await selectResumeRecord(userId, resumeId);

  if (existing) {
    return existing;
  }

  const created = await insertResumeRecord(
    createLocalResumeRecord(userId, resumeId, locale),
  );

  if (!created) {
    const concurrentRecord = await selectResumeRecord(userId, resumeId);

    if (concurrentRecord) {
      return concurrentRecord;
    }

    throw new ResumeIdentifierConflictError(resumeId);
  }

  return (await selectResumeRecord(userId, resumeId))!;
}

async function requireExistingResumeRecord(userId: string, resumeId: string) {
  const existing = await selectResumeRecord(userId, resumeId);

  if (!existing) {
    throw new ResumeNotFoundError(resumeId);
  }

  return existing;
}

export function getResumeVersionHistoryLimit() {
  const parsed = Number.parseInt(
    process.env.RESUME_VERSION_HISTORY_LIMIT ?? "",
    10,
  );

  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_RESUME_VERSION_HISTORY_LIMIT;
}

async function createResumeVersionSnapshotFromRecord(record: ResumeRecord) {
  const snapshotId = randomUUID();
  const historyLimit = getResumeVersionHistoryLimit();

  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`anonresume:resume-version:${record.userId}:${record.id}`}))`,
    );
    const [created] = await transaction
      .insert(resumeVersions)
      .values({
        id: snapshotId,
        userId: record.userId,
        resumeId: record.id,
        version: record.version,
        document: record.document,
      })
      .returning();
    const stale = await transaction
      .select({ id: resumeVersions.id })
      .from(resumeVersions)
      .where(
        and(
          eq(resumeVersions.userId, record.userId),
          eq(resumeVersions.resumeId, record.id),
        ),
      )
      .orderBy(desc(resumeVersions.createdAt), desc(resumeVersions.id))
      .offset(historyLimit);

    if (stale.length > 0) {
      await transaction
        .delete(resumeVersions)
        .where(inArray(resumeVersions.id, stale.map(({ id }) => id)));
    }

    return mapResumeVersionRow(created!);
  });
}

export async function resetResumeRepository(options?: {
  preservePersistedData?: boolean;
}) {
  if (options?.preservePersistedData) {
    return;
  }

  await db.delete(resumeVersions);
  await db.delete(resumes);
}

export async function paginateResumeEntries({
  userId,
  page,
  pageSize,
  query,
}: PageRequest & {
  userId: string;
  query?: string;
}): Promise<PageResult<ResumeCatalogEntry>> {
  const normalizedQuery = query?.trim().slice(0, 100);
  const searchPattern = normalizedQuery ? `%${normalizedQuery}%` : undefined;
  const filter = searchPattern
    ? and(
        eq(resumes.userId, userId),
        or(
          ilike(resumes.name, searchPattern),
          ilike(resumes.summary, searchPattern),
          ilike(resumes.customSummary, searchPattern),
        ),
      )
    : eq(resumes.userId, userId);
  const [totalRow] = await db
    .select({ value: count() })
    .from(resumes)
    .where(filter);
  const total = totalRow?.value ?? 0;
  const request = { page, pageSize };
  const resolved = resolvePage(total, request);
  const rows = await db
    .select({
      id: resumes.id,
      title: resumes.name,
      summary: resumes.summary,
      customSummary: resumes.customSummary,
      version: resumes.version,
      document: resumes.document,
      updatedAt: resumes.updatedAt,
      published: resumes.published,
      slug: resumes.slug,
    })
    .from(resumes)
    .where(filter)
    .orderBy(desc(resumes.updatedAt), asc(resumes.id))
    .limit(pageSize)
    .offset(resolved.offset);
  const items = rows.map(({ customSummary, document, slug, updatedAt, ...row }) => ({
    ...row,
    summary: resolveSummary({
      customSummary,
      document: validateResumeDocument(document),
      summary: row.summary,
    }),
    updatedAt: updatedAt.getTime(),
    slug: slug ?? undefined,
  }));

  return createPageResult(items, total, request);
}

export async function paginateResumeVersionSnapshots({
  userId,
  resumeId,
  page,
  pageSize,
}: PageRequest & {
  userId: string;
  resumeId: string;
}): Promise<PageResult<ResumeVersionSnapshot>> {
  const filter = and(
    eq(resumeVersions.userId, userId),
    eq(resumeVersions.resumeId, resumeId),
  );
  const [totalRow] = await db
    .select({ value: count() })
    .from(resumeVersions)
    .where(filter);
  const total = totalRow?.value ?? 0;
  const request = { page, pageSize };
  const resolved = resolvePage(total, request);
  const rows = await db
    .select()
    .from(resumeVersions)
    .where(filter)
    .orderBy(desc(resumeVersions.createdAt), desc(resumeVersions.id))
    .limit(pageSize)
    .offset(resolved.offset);

  return createPageResult(rows.map(mapResumeVersionRow), total, request);
}

export async function getResumeVersionSnapshot(
  userId: string,
  resumeId: string,
  snapshotId: string,
): Promise<ResumeVersionSnapshot> {
  const rows = await db
    .select()
    .from(resumeVersions)
    .where(
      and(
        eq(resumeVersions.id, snapshotId),
        eq(resumeVersions.userId, userId),
        eq(resumeVersions.resumeId, resumeId),
      ),
    )
    .limit(1);
  const snapshot = rows[0];

  if (!snapshot) {
    throw new ResumeVersionSnapshotNotFoundError(snapshotId);
  }

  return mapResumeVersionRow(snapshot);
}

export async function getResumeRecord(
  resumeId: string,
): Promise<ResumeRecord | undefined>;
export async function getResumeRecord(
  userId: string,
  resumeId: string,
): Promise<ResumeRecord | undefined>;
export async function getResumeRecord(userIdOrResumeId: string, resumeId?: string) {
  const userId = resumeId ? userIdOrResumeId : LEGACY_USER_ID;
  const scopedResumeId = resumeId || userIdOrResumeId;

  return selectResumeRecord(userId, scopedResumeId);
}

export async function getOrCreateResumeRecord(
  resumeId: string,
): Promise<ResumeRecord>;
export async function getOrCreateResumeRecord(
  userId: string,
  resumeId: string,
): Promise<ResumeRecord>;
export async function getOrCreateResumeRecord(userIdOrResumeId: string, resumeId?: string) {
  return ensureResumeRecord(
    resumeId ? userIdOrResumeId : LEGACY_USER_ID,
    resumeId || userIdOrResumeId,
  );
}

export async function createResumeRecord(
  userId: string,
  resumeId: string,
): Promise<ResumeRecord>;
export async function createResumeRecord(
  userId: string,
  resumeId: string,
  locale: AppLocale,
): Promise<ResumeRecord>;
export async function createResumeRecord(
  userId: string,
  resumeId: string,
  locale: AppLocale = defaultLocale,
) {
  return ensureResumeRecord(userId, resumeId, locale);
}

async function createStrictResumeRecord(
  userId: string,
  resumeId: string,
  locale: AppLocale = defaultLocale,
  document?: ResumeDocument,
) {
  if (await selectResumeRecord(userId, resumeId)) {
    throw new ResumeIdentifierConflictError(resumeId);
  }

  const record = createLocalResumeRecord(userId, resumeId, locale);

  if (document) {
    record.title = document.meta.title;
    record.summary = buildResumeSummary({ document, summary: record.summary });
    record.document = document;
  }

  const created = await insertResumeRecord(record);

  if (!created) {
    throw new ResumeIdentifierConflictError(resumeId);
  }

  return (await selectResumeRecord(userId, resumeId))!;
}

export async function createGeneratedResumeRecord(params: {
  userId: string;
  locale?: AppLocale;
  templateId?: ResumeTemplateId;
  document?: ResumeDocument;
  createId?: () => string;
}): Promise<ResumeRecord> {
  const createId = params.createId ?? createResumeId;
  const locale = params.locale ?? defaultLocale;
  const hasTemplate = params.templateId !== undefined;
  const hasDocument = params.document !== undefined;

  if (hasTemplate && hasDocument) {
    throw new Error("Template and imported document inputs are mutually exclusive.");
  }

  const sourceDocument = hasDocument
    ? validateResumeDocument(params.document)
    : createResumeDocumentFromTemplate(params.templateId ?? "blank", locale);
  let lastConflict: ResumeIdentifierConflictError | undefined;

  for (let attempt = 0; attempt < GENERATED_RESUME_ID_MAX_ATTEMPTS; attempt += 1) {
    const resumeId = createId();

    try {
      return await createStrictResumeRecord(
        params.userId,
        resumeId,
        locale,
        sourceDocument,
      );
    } catch (error) {
      if (error instanceof ResumeIdentifierConflictError) {
        lastConflict = error;
        continue;
      }

      throw error;
    }
  }

  throw lastConflict!;
}

export async function duplicateResumeRecord(params: {
  userId: string;
  resumeId: string;
  copyId: string;
  title: string;
}): Promise<ResumeRecord> {
  const source = await requireExistingResumeRecord(params.userId, params.resumeId);
  const document = structuredClone(source.document);

  document.meta.title = params.title;

  const copied = await insertResumeRecord({
    id: params.copyId,
    userId: params.userId,
    title: params.title,
    summary: source.summary,
    customSummary: source.customSummary,
    document,
    version: 1,
    updatedAt: Date.now(),
    published: false,
  });

  if (!copied) {
    throw new ResumeIdentifierConflictError(params.copyId);
  }

  return (await selectResumeRecord(params.userId, params.copyId))!;
}

export async function duplicateGeneratedResumeRecord(params: {
  userId: string;
  resumeId: string;
  title: string;
  createId?: () => string;
}): Promise<ResumeRecord> {
  const createId = params.createId ?? createResumeId;
  let lastConflict: ResumeIdentifierConflictError | undefined;

  for (let attempt = 0; attempt < GENERATED_RESUME_ID_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await duplicateResumeRecord({
        userId: params.userId,
        resumeId: params.resumeId,
        copyId: createId(),
        title: params.title,
      });
    } catch (error) {
      if (error instanceof ResumeIdentifierConflictError) {
        lastConflict = error;
        continue;
      }

      throw error;
    }
  }

  throw lastConflict!;
}

export async function deleteResumeRecord(userId: string, resumeId: string) {
  await db.transaction(async (transaction) => {
    const deleted = await transaction
      .delete(resumes)
      .where(and(eq(resumes.userId, userId), eq(resumes.id, resumeId)))
      .returning({ id: resumes.id });

    if (!deleted[0]) {
      throw new ResumeNotFoundError(resumeId);
    }

    await transaction
      .delete(resumeVersions)
      .where(
        and(
          eq(resumeVersions.userId, userId),
          eq(resumeVersions.resumeId, resumeId),
        ),
      );
  });
}

export async function saveResumeRecord(params: {
  userId?: string;
  resumeId: string;
  version: number;
  document?: unknown;
  summary?: string;
}) {
  const userId = params.userId || LEGACY_USER_ID;
  const current = await requireExistingResumeRecord(userId, params.resumeId);

  if (params.version !== current.version) {
    throw new ResumeVersionConflictError(current.version);
  }

  const document =
    params.document === undefined
      ? current.document
      : validateResumeDocument(params.document);
  const summary = buildResumeSummary({
    document,
    summary: current.summary,
  });
  const customSummary =
    params.summary === undefined
      ? current.customSummary
      : formatCatalogSummary(params.summary);

  const rows = await db
    .update(resumes)
    .set({
      name: document.meta.title,
      summary,
      customSummary,
      document,
      schemaVersion: RESUME_SCHEMA_VERSION,
      version: sql`${resumes.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(resumes.userId, userId),
        eq(resumes.id, params.resumeId),
        eq(resumes.version, params.version),
      ),
    )
    .returning();

  if (!rows[0]) {
    const latest = await selectResumeRecord(userId, params.resumeId);

    throw new ResumeVersionConflictError(latest?.version ?? current.version);
  }

  return mapResumeRow(rows[0]);
}

export async function publishResumeRecord(resumeId: string): Promise<ResumeRecord>;
export async function publishResumeRecord(
  userId: string,
  resumeId: string,
): Promise<ResumeRecord>;
export async function publishResumeRecord(userIdOrResumeId: string, resumeId?: string) {
  const userId = resumeId ? userIdOrResumeId : LEGACY_USER_ID;
  const scopedResumeId = resumeId || userIdOrResumeId;
  const current = await requireExistingResumeRecord(userId, scopedResumeId);
  await createResumeVersionSnapshotFromRecord(current);
  const rows = await db
    .update(resumes)
    .set({
      published: true,
      slug: current.slug ?? current.id,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(resumes.userId, userId), eq(resumes.id, scopedResumeId)),
    )
    .returning();

  return mapResumeRow(rows[0]!);
}

export async function unpublishResumeRecord(resumeId: string): Promise<ResumeRecord>;
export async function unpublishResumeRecord(
  userId: string,
  resumeId: string,
): Promise<ResumeRecord>;
export async function unpublishResumeRecord(
  userIdOrResumeId: string,
  resumeId?: string,
) {
  const userId = resumeId ? userIdOrResumeId : LEGACY_USER_ID;
  const scopedResumeId = resumeId || userIdOrResumeId;

  await requireExistingResumeRecord(userId, scopedResumeId);

  const rows = await db
    .update(resumes)
    .set({
      published: false,
      updatedAt: sql`now()`,
    })
    .where(and(eq(resumes.userId, userId), eq(resumes.id, scopedResumeId)))
    .returning();

  return mapResumeRow(rows[0]!);
}

export async function getPublishedResumeBySlug(slug: string) {
  const rows = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.slug, slug), eq(resumes.published, true)))
    .limit(1);

  return rows[0] ? mapResumeRow(rows[0]) : undefined;
}

export async function snapshotResumeVersion(
  userId: string,
  resumeId: string,
): Promise<ResumeVersionSnapshot> {
  const record = await requireExistingResumeRecord(userId, resumeId);

  return createResumeVersionSnapshotFromRecord(record);
}

export async function restoreResumeVersion(params: {
  userId: string;
  resumeId: string;
  snapshotId: string;
  version: number;
}): Promise<ResumeRecord> {
  const current = await requireExistingResumeRecord(params.userId, params.resumeId);

  if (current.version !== params.version) {
    throw new ResumeVersionConflictError(current.version);
  }

  const rows = await db
    .select()
    .from(resumeVersions)
    .where(
      and(
        eq(resumeVersions.id, params.snapshotId),
        eq(resumeVersions.userId, params.userId),
        eq(resumeVersions.resumeId, params.resumeId),
      ),
    )
    .limit(1);
  const snapshot = rows[0];

  if (!snapshot) {
    throw new ResumeVersionSnapshotNotFoundError(params.snapshotId);
  }

  // A restore is reversible: persist the current document before replacing it.
  await createResumeVersionSnapshotFromRecord(current);

  return saveResumeRecord({
    userId: params.userId,
    resumeId: params.resumeId,
    version: params.version,
    document: snapshot.document,
  });
}
