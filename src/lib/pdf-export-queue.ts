import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db, pdfExportJobs } from "@/db";
import type { ResumeDocument } from "@/domain/resume/schema";
import {
  getPdfExportWorkerAvailability,
  PDF_EXPORT_ACTIVE_POLL_MS,
  PDF_EXPORT_OFFLINE_POLL_MS,
} from "@/lib/pdf-export-availability";

const PDF_QUEUE_LOCK = "anonresume:pdf-export-capacity";
const DEFAULT_QUEUE_LIMIT = 100;
const DEFAULT_MAX_CONCURRENCY = 2;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_RESULT_TTL_MS = 15 * 60_000;
const DEFAULT_FORCE_EXPIRY_MS = 24 * 60 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_ACTIVE_PER_USER = 3;

export class PdfExportQueueFullError extends Error {}
export class PdfExportUserQueueLimitError extends Error {}
export class PdfExportAccessError extends Error {}
export class PdfExportNotFoundError extends Error {}
export class PdfExportNotReadyError extends Error {}
export class PdfExportStateConflictError extends Error {}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;

  return value.trim().toLowerCase() === "true";
}

export function getPdfExportQueueConfig() {
  return {
    maxConcurrency: parsePositiveInteger(
      process.env.PDF_EXPORT_MAX_CONCURRENCY,
      DEFAULT_MAX_CONCURRENCY,
    ),
    queueLimit: parsePositiveInteger(
      process.env.PDF_EXPORT_QUEUE_LIMIT,
      DEFAULT_QUEUE_LIMIT,
    ),
    leaseMs: parsePositiveInteger(
      process.env.PDF_EXPORT_LEASE_MS,
      DEFAULT_LEASE_MS,
    ),
    resultTtlMs: parsePositiveInteger(
      process.env.PDF_EXPORT_RESULT_TTL_MS,
      DEFAULT_RESULT_TTL_MS,
    ),
    maxAttempts: parsePositiveInteger(
      process.env.PDF_EXPORT_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
    ),
    maxActivePerUser: parsePositiveInteger(
      process.env.PDF_EXPORT_MAX_ACTIVE_PER_USER,
      DEFAULT_MAX_ACTIVE_PER_USER,
    ),
    forceExpiryMs: parsePositiveInteger(
      process.env.PDF_EXPORT_FORCE_EXPIRY_MS,
      DEFAULT_FORCE_EXPIRY_MS,
    ),
    allowAnonymous: parseBoolean(
      process.env.PDF_EXPORT_ALLOW_ANONYMOUS,
      false,
    ),
  };
}

let anonymousExportWarningShown = false;

export function warnIfAnonymousPdfExportIsEnabled() {
  if (
    getPdfExportQueueConfig().allowAnonymous &&
    !anonymousExportWarningShown
  ) {
    anonymousExportWarningShown = true;
    console.warn(
      "[AnonResume] Anonymous PDF export is enabled. This is not recommended because public callers can consume shared export capacity.",
    );
  }
}

function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenHashesMatch(token: string, expectedHash: string) {
  const actual = Buffer.from(hashAccessToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function getWorkerSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required for PDF export workers");
  }

  return secret;
}

export function createPdfExportWorkerToken(jobId: string) {
  return createHmac("sha256", getWorkerSecret())
    .update(`pdf-export:${jobId}`)
    .digest("hex");
}

export function verifyPdfExportWorkerToken(jobId: string, token: string) {
  const expected = Buffer.from(createPdfExportWorkerToken(jobId), "hex");
  const actual = Buffer.from(token, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hasAccess(
  row: {
    requesterUserId: string | null;
    accessTokenHash: string;
  },
  access: {
    requesterUserId?: string | null;
    accessToken?: string | null;
  },
) {
  if (
    access.requesterUserId &&
    row.requesterUserId === access.requesterUserId
  ) {
    return true;
  }

  return Boolean(
    access.accessToken &&
      tokenHashesMatch(access.accessToken, row.accessTokenHash),
  );
}

async function requireAccessibleJob(
  access: {
    jobId: string;
    requesterUserId?: string | null;
    accessToken?: string | null;
  },
) {
  const rows = await db
    .select()
    .from(pdfExportJobs)
    .where(eq(pdfExportJobs.id, access.jobId))
    .limit(1);
  const row = rows[0];

  if (!row) {
    throw new PdfExportNotFoundError(access.jobId);
  }

  if (
    row.createdAt.getTime() <=
    Date.now() - getPdfExportQueueConfig().forceExpiryMs
  ) {
    throw new PdfExportNotFoundError(access.jobId);
  }

  if (!hasAccess(row, access)) {
    throw new PdfExportAccessError(access.jobId);
  }

  return row;
}

export async function enqueuePdfExport(params: {
  resumeUserId: string;
  resumeId: string;
  requesterUserId?: string | null;
  document: ResumeDocument;
  filename: string;
  queueLimit?: number;
  maxActivePerUser?: number;
}) {
  const accessToken = randomBytes(32).toString("base64url");
  const queueLimit =
    params.queueLimit ?? getPdfExportQueueConfig().queueLimit;
  const maxActivePerUser =
    params.maxActivePerUser ??
    getPdfExportQueueConfig().maxActivePerUser;

  const [job] = await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${PDF_QUEUE_LOCK}))`,
    );
    const [active] = await transaction
      .select({ value: count() })
      .from(pdfExportJobs)
      .where(inArray(pdfExportJobs.status, ["queued", "running"]));

    if ((active?.value ?? 0) >= queueLimit) {
      throw new PdfExportQueueFullError();
    }

    if (params.requesterUserId) {
      const [requesterActive] = await transaction
        .select({ value: count() })
        .from(pdfExportJobs)
        .where(
          and(
            eq(pdfExportJobs.requesterUserId, params.requesterUserId),
            inArray(pdfExportJobs.status, ["queued", "running"]),
          ),
        );

      if ((requesterActive?.value ?? 0) >= maxActivePerUser) {
        throw new PdfExportUserQueueLimitError();
      }
    }

    return transaction
      .insert(pdfExportJobs)
      .values({
        resumeUserId: params.resumeUserId,
        resumeId: params.resumeId,
        requesterUserId: params.requesterUserId ?? null,
        accessTokenHash: hashAccessToken(accessToken),
        document: params.document,
        filename: params.filename,
      })
      .returning({ id: pdfExportJobs.id });
  });

  return {
    jobId: job!.id,
    accessToken,
  };
}

export async function getPdfExportStatus(params: {
  jobId: string;
  requesterUserId?: string | null;
  accessToken?: string | null;
}) {
  const row = await requireAccessibleJob(params);
  const active = row.status === "queued" || row.status === "running";
  const workerAvailability = active
    ? await getPdfExportWorkerAvailability()
    : null;
  let position: number | null = null;
  let queuedCount = 0;

  if (row.status === "queued") {
    const queueStats = await db.execute<{
      position: number;
      queuedCount: number;
    }>(sql`
      SELECT
        (
          SELECT count(*)::int
          FROM ${pdfExportJobs} AS all_queued
          WHERE all_queued.status = 'queued'
        ) AS "queuedCount",
        count(*)::int AS position
      FROM ${pdfExportJobs} AS queued
      JOIN ${pdfExportJobs} AS target ON target.id = ${row.id}
      WHERE queued.status = 'queued'
        AND (queued.created_at, queued.id) <= (target.created_at, target.id)
    `);

    queuedCount = queueStats.rows[0]?.queuedCount ?? 0;
    position = queueStats.rows[0]?.position ?? 0;
  } else {
    const [queued] = await db
      .select({ value: count() })
      .from(pdfExportJobs)
      .where(eq(pdfExportJobs.status, "queued"));

    queuedCount = queued?.value ?? 0;
  }

  return {
    id: row.id,
    status: row.status,
    position,
    queuedCount,
    cancelRequested: row.cancelRequested,
    error: row.error,
    filename: row.filename,
    createdAt: row.createdAt.getTime(),
    startedAt: row.startedAt?.getTime() ?? null,
    completedAt: row.completedAt?.getTime() ?? null,
    pollAfterMs: active
      ? workerAvailability?.available
        ? PDF_EXPORT_ACTIVE_POLL_MS
        : PDF_EXPORT_OFFLINE_POLL_MS
      : null,
    workerAvailable: workerAvailability?.available ?? null,
  };
}

export async function cancelPdfExport(params: {
  jobId: string;
  requesterUserId?: string | null;
  accessToken?: string | null;
}) {
  const row = await requireAccessibleJob(params);

  if (row.status === "queued") {
    await db
      .update(pdfExportJobs)
      .set({
        status: "cancelled",
        cancelRequested: true,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(pdfExportJobs.id, row.id),
          eq(pdfExportJobs.status, "queued"),
        ),
      );
  } else if (row.status === "running") {
    await db
      .update(pdfExportJobs)
      .set({ cancelRequested: true })
      .where(eq(pdfExportJobs.id, row.id));
  }
}

export async function adminCancelPdfExport(jobId: string) {
  return db.transaction(async (transaction) => {
    const rows = await transaction
      .select()
      .from(pdfExportJobs)
      .where(eq(pdfExportJobs.id, jobId))
      .limit(1)
      .for("update");
    const row = rows[0];

    if (!row) throw new PdfExportNotFoundError(jobId);
    if (row.status === "queued") {
      await transaction
        .update(pdfExportJobs)
        .set({
          status: "cancelled",
          cancelRequested: true,
          completedAt: new Date(),
        })
        .where(eq(pdfExportJobs.id, jobId));
      return;
    }
    if (row.status === "running") {
      await transaction
        .update(pdfExportJobs)
        .set({ cancelRequested: true })
        .where(eq(pdfExportJobs.id, jobId));
      return;
    }
    throw new PdfExportStateConflictError(jobId);
  });
}

export async function adminRetryPdfExport(
  jobId: string,
  options: { queueLimit?: number } = {},
) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${PDF_QUEUE_LOCK}))`,
    );
    const rows = await transaction
      .select()
      .from(pdfExportJobs)
      .where(eq(pdfExportJobs.id, jobId))
      .limit(1)
      .for("update");
    const row = rows[0];

    if (!row) throw new PdfExportNotFoundError(jobId);
    if (row.status !== "failed" && row.status !== "cancelled") {
      throw new PdfExportStateConflictError(jobId);
    }

    const [active] = await transaction
      .select({ value: count() })
      .from(pdfExportJobs)
      .where(inArray(pdfExportJobs.status, ["queued", "running"]));
    if (
      (active?.value ?? 0) >=
      (options.queueLimit ?? getPdfExportQueueConfig().queueLimit)
    ) {
      throw new PdfExportQueueFullError();
    }

    const [retried] = await transaction
      .insert(pdfExportJobs)
      .values({
        resumeUserId: row.resumeUserId,
        resumeId: row.resumeId,
        requesterUserId: row.requesterUserId,
        accessTokenHash: hashAccessToken(randomBytes(32).toString("base64url")),
        document: row.document,
        filename: row.filename,
      })
      .returning({ id: pdfExportJobs.id });
    return { jobId: retried!.id };
  });
}

export async function claimPdfExportJobs(params: {
  workerId: string;
  maxConcurrency: number;
  maxAttempts?: number;
  leaseMs: number;
}) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${PDF_QUEUE_LOCK}))`,
    );

    const now = new Date();
    const maxAttempts = params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    await transaction
      .update(pdfExportJobs)
      .set({
        status: "failed",
        error: "PDF export exceeded the retry limit",
        workerId: null,
        leaseExpiresAt: null,
        completedAt: now,
      })
      .where(
        and(
          eq(pdfExportJobs.status, "running"),
          lt(pdfExportJobs.leaseExpiresAt, now),
          eq(pdfExportJobs.cancelRequested, false),
          gte(pdfExportJobs.attempts, maxAttempts),
        ),
      );
    await transaction
      .update(pdfExportJobs)
      .set({
        status: "cancelled",
        workerId: null,
        leaseExpiresAt: null,
        completedAt: now,
      })
      .where(
        and(
          eq(pdfExportJobs.status, "running"),
          lt(pdfExportJobs.leaseExpiresAt, now),
          eq(pdfExportJobs.cancelRequested, true),
        ),
      );
    await transaction
      .update(pdfExportJobs)
      .set({
        status: "queued",
        workerId: null,
        leaseExpiresAt: null,
        startedAt: null,
      })
      .where(
        and(
          eq(pdfExportJobs.status, "running"),
          lt(pdfExportJobs.leaseExpiresAt, now),
          eq(pdfExportJobs.cancelRequested, false),
          lt(pdfExportJobs.attempts, maxAttempts),
        ),
      );

    const [running] = await transaction
      .select({ value: count() })
      .from(pdfExportJobs)
      .where(eq(pdfExportJobs.status, "running"));
    const available = Math.max(
      0,
      params.maxConcurrency - (running?.value ?? 0),
    );

    if (available === 0) {
      return [];
    }

    const candidates = await transaction
      .select({ id: pdfExportJobs.id })
      .from(pdfExportJobs)
      .where(eq(pdfExportJobs.status, "queued"))
      .orderBy(asc(pdfExportJobs.createdAt), asc(pdfExportJobs.id))
      .limit(available)
      .for("update", { skipLocked: true });

    if (candidates.length === 0) {
      return [];
    }

    const ids = candidates.map((candidate) => candidate.id);
    const claimed = await transaction
      .update(pdfExportJobs)
      .set({
        status: "running",
        workerId: params.workerId,
        attempts: sql`${pdfExportJobs.attempts} + 1`,
        startedAt: now,
        leaseExpiresAt: new Date(now.getTime() + params.leaseMs),
      })
      .where(
        and(
          inArray(pdfExportJobs.id, ids),
          eq(pdfExportJobs.status, "queued"),
        ),
      )
      .returning();
    const order = new Map(ids.map((id, index) => [id, index]));

    return claimed.sort(
      (left, right) => order.get(left.id)! - order.get(right.id)!,
    );
  });
}

export async function renewPdfExportLease(params: {
  jobId: string;
  workerId: string;
  leaseMs: number;
}) {
  const rows = await db
    .update(pdfExportJobs)
    .set({ leaseExpiresAt: new Date(Date.now() + params.leaseMs) })
    .where(
      and(
        eq(pdfExportJobs.id, params.jobId),
        eq(pdfExportJobs.workerId, params.workerId),
        eq(pdfExportJobs.status, "running"),
      ),
    )
    .returning({ cancelRequested: pdfExportJobs.cancelRequested });

  return rows[0]?.cancelRequested ?? true;
}

export async function completePdfExport(params: {
  jobId: string;
  workerId: string;
  result: Uint8Array;
  resultTtlMs?: number;
}) {
  const now = new Date();
  const rows = await db
    .update(pdfExportJobs)
    .set({
      status: "completed",
      result: Buffer.from(params.result),
      workerId: null,
      leaseExpiresAt: null,
      completedAt: now,
      resultExpiresAt: new Date(
        now.getTime() +
          (params.resultTtlMs ?? getPdfExportQueueConfig().resultTtlMs),
      ),
    })
    .where(
      and(
        eq(pdfExportJobs.id, params.jobId),
        eq(pdfExportJobs.workerId, params.workerId),
        eq(pdfExportJobs.status, "running"),
        eq(pdfExportJobs.cancelRequested, false),
      ),
    )
    .returning({ id: pdfExportJobs.id });

  return rows.length > 0;
}

export async function failPdfExport(params: {
  jobId: string;
  workerId: string;
  error: string;
  cancelled?: boolean;
}) {
  const now = new Date();

  await db
    .update(pdfExportJobs)
    .set({
      status: params.cancelled ? "cancelled" : "failed",
      error: params.cancelled ? null : params.error,
      workerId: null,
      leaseExpiresAt: null,
      completedAt: now,
    })
    .where(
      and(
        eq(pdfExportJobs.id, params.jobId),
        eq(pdfExportJobs.workerId, params.workerId),
        eq(pdfExportJobs.status, "running"),
      ),
    );
}

export async function getPdfExportDownload(params: {
  jobId: string;
  requesterUserId?: string | null;
  accessToken?: string | null;
}) {
  const row = await requireAccessibleJob(params);

  if (
    row.status !== "completed" ||
    !row.result ||
    !row.resultExpiresAt ||
    row.resultExpiresAt.getTime() <= Date.now()
  ) {
    throw new PdfExportNotReadyError(row.id);
  }

  return {
    filename: row.filename,
    result: row.result,
  };
}

export async function getPdfExportDocumentForWorker(params: {
  jobId: string;
  workerToken: string;
}) {
  if (!verifyPdfExportWorkerToken(params.jobId, params.workerToken)) {
    throw new PdfExportAccessError(params.jobId);
  }

  const rows = await db
    .select({
      document: pdfExportJobs.document,
      filename: pdfExportJobs.filename,
      status: pdfExportJobs.status,
      createdAt: pdfExportJobs.createdAt,
    })
    .from(pdfExportJobs)
    .where(eq(pdfExportJobs.id, params.jobId))
    .limit(1);
  const row = rows[0];

  if (
    !row ||
    row.status !== "running" ||
    row.createdAt.getTime() <=
      Date.now() - getPdfExportQueueConfig().forceExpiryMs
  ) {
    throw new PdfExportNotFoundError(params.jobId);
  }

  return {
    document: row.document,
    filename: row.filename,
    status: row.status,
  };
}

export async function deleteExpiredPdfExportResults(options?: {
  forceExpiryMs?: number;
}) {
  const now = new Date();
  const config = getPdfExportQueueConfig();
  const forceExpiryMs = options?.forceExpiryMs ?? config.forceExpiryMs;

  return db
    .delete(pdfExportJobs)
    .where(
      or(
        lt(
          pdfExportJobs.createdAt,
          new Date(now.getTime() - forceExpiryMs),
        ),
        lt(pdfExportJobs.resultExpiresAt, now),
        and(
          inArray(pdfExportJobs.status, ["failed", "cancelled"]),
          lt(
            pdfExportJobs.completedAt,
            new Date(now.getTime() - config.resultTtlMs),
          ),
        ),
      ),
    )
    .returning({ id: pdfExportJobs.id });
}
