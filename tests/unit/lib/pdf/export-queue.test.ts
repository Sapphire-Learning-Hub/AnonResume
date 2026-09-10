import { eq, inArray } from "drizzle-orm";

import { db, pdfExportJobs } from "@/db";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  adminCancelPdfExport,
  adminRetryPdfExport,
  cancelPdfExport,
  claimPdfExportJobs,
  completePdfExport,
  enqueuePdfExport,
  getPdfExportDownload,
  getPdfExportDocumentForWorker,
  getPdfExportStatus,
  deleteExpiredPdfExportResults,
  PdfExportAccessError,
  PdfExportNotFoundError,
  PdfExportUserQueueLimitError,
} from "@/lib/pdf/export-queue";
import {
  createGeneratedResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";

describe("PDF export queue", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-demo",
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetResumeRepository();
  });

  async function enqueue(index = 1) {
    return enqueuePdfExport({
      resumeUserId: "user-demo",
      resumeId: "resume-demo",
      requesterUserId: "user-demo",
      document: createDefaultResumeDocument(),
      filename: `resume-${index}.pdf`,
      queueLimit: 20,
    });
  }

  it("stores only a token hash and reports FIFO position", async () => {
    const first = await enqueue(1);
    const second = await enqueue(2);
    const rows = await db
      .select({ accessTokenHash: pdfExportJobs.accessTokenHash })
      .from(pdfExportJobs)
      .where(eq(pdfExportJobs.id, first.jobId));

    expect(rows[0]?.accessTokenHash).not.toBe(first.accessToken);
    await expect(
      getPdfExportStatus({
        jobId: second.jobId,
        accessToken: second.accessToken,
      }),
    ).resolves.toMatchObject({
      status: "queued",
      position: 2,
      queuedCount: 2,
    });
  });

  it("allows an administrator to cancel queued and running jobs by id", async () => {
    const running = await enqueue(1);
    const queued = await enqueue(2);
    await claimPdfExportJobs({
      workerId: "admin-cancel-worker",
      maxConcurrency: 1,
      leaseMs: 30_000,
    });

    await adminCancelPdfExport(running.jobId);
    await adminCancelPdfExport(queued.jobId);

    const rows = await db
      .select({ id: pdfExportJobs.id, status: pdfExportJobs.status, cancelRequested: pdfExportJobs.cancelRequested })
      .from(pdfExportJobs);
    expect(rows.find((row) => row.id === running.jobId)).toMatchObject({
      status: "running",
      cancelRequested: true,
    });
    expect(rows.find((row) => row.id === queued.jobId)).toMatchObject({
      status: "cancelled",
      cancelRequested: true,
    });
  });

  it("retries only terminal failed or cancelled jobs", async () => {
    const failed = await enqueue();
    await db
      .update(pdfExportJobs)
      .set({
        status: "failed",
        attempts: 3,
        error: "renderer failed",
        completedAt: new Date(),
      })
      .where(eq(pdfExportJobs.id, failed.jobId));

    const retried = await adminRetryPdfExport(failed.jobId, { queueLimit: 20 });

    const rows = await db
      .select()
      .from(pdfExportJobs)
      .where(inArray(pdfExportJobs.id, [failed.jobId, retried.jobId]));
    expect(rows.find((row) => row.id === failed.jobId)).toMatchObject({
      status: "failed",
      attempts: 3,
      error: "renderer failed",
    });
    expect(rows.find((row) => row.id === retried.jobId)).toMatchObject({
      status: "queued",
      attempts: 0,
      error: null,
      cancelRequested: false,
      completedAt: null,
    });
  });

  it("claims jobs in FIFO order without exceeding global concurrency", async () => {
    const first = await enqueue(1);
    const second = await enqueue(2);
    await enqueue(3);

    const claimed = await claimPdfExportJobs({
      workerId: "worker-one",
      maxConcurrency: 2,
      leaseMs: 30_000,
    });
    const blocked = await claimPdfExportJobs({
      workerId: "worker-two",
      maxConcurrency: 2,
      leaseMs: 30_000,
    });

    expect(claimed.map((job) => job.id)).toEqual([
      first.jobId,
      second.jobId,
    ]);
    expect(blocked).toEqual([]);
  });

  it("reclaims an expired lease", async () => {
    const queued = await enqueue();

    await claimPdfExportJobs({
      workerId: "dead-worker",
      maxConcurrency: 1,
      leaseMs: 30_000,
    });
    await db
      .update(pdfExportJobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(pdfExportJobs.id, queued.jobId));

    const reclaimed = await claimPdfExportJobs({
      workerId: "new-worker",
      maxConcurrency: 1,
      leaseMs: 30_000,
    });

    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]).toMatchObject({
      id: queued.jobId,
      workerId: "new-worker",
      attempts: 2,
    });
  });

  it("fails an expired job after the configured attempt limit", async () => {
    const queued = await enqueue();

    await claimPdfExportJobs({
      workerId: "dead-worker",
      maxConcurrency: 1,
      maxAttempts: 1,
      leaseMs: 30_000,
    });
    await db
      .update(pdfExportJobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(pdfExportJobs.id, queued.jobId));

    await expect(
      claimPdfExportJobs({
        workerId: "new-worker",
        maxConcurrency: 1,
        maxAttempts: 1,
        leaseMs: 30_000,
      }),
    ).resolves.toEqual([]);
    await expect(
      getPdfExportStatus({
        jobId: queued.jobId,
        requesterUserId: "user-demo",
      }),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("cancels queued jobs immediately and marks running jobs for cancellation", async () => {
    const running = await enqueue(1);
    const queued = await enqueue(2);

    await claimPdfExportJobs({
      workerId: "worker-one",
      maxConcurrency: 1,
      leaseMs: 30_000,
    });
    await cancelPdfExport({
      jobId: running.jobId,
      requesterUserId: "user-demo",
    });
    await cancelPdfExport({
      jobId: queued.jobId,
      requesterUserId: "user-demo",
    });

    await expect(
      getPdfExportStatus({
        jobId: queued.jobId,
        requesterUserId: "user-demo",
      }),
    ).resolves.toMatchObject({ status: "cancelled" });
    await expect(
      getPdfExportStatus({
        jobId: running.jobId,
        requesterUserId: "user-demo",
      }),
    ).resolves.toMatchObject({
      status: "running",
      cancelRequested: true,
    });
  });

  it("stores completed bytes for an authorized download", async () => {
    const queued = await enqueue();
    const [job] = await claimPdfExportJobs({
      workerId: "worker-one",
      maxConcurrency: 1,
      leaseMs: 30_000,
    });

    await completePdfExport({
      jobId: job!.id,
      workerId: "worker-one",
      result: new Uint8Array([1, 2, 3]),
      resultTtlMs: 60_000,
    });

    await expect(
      getPdfExportDownload({
        jobId: queued.jobId,
        accessToken: queued.accessToken,
      }),
    ).resolves.toMatchObject({
      filename: "resume-1.pdf",
      result: Buffer.from([1, 2, 3]),
    });
  });

  it("rejects callers without ownership or the capability token", async () => {
    const queued = await enqueue();

    await expect(
      getPdfExportStatus({
        jobId: queued.jobId,
        accessToken: "incorrect-token",
      }),
    ).rejects.toBeInstanceOf(PdfExportAccessError);
  });

  it("enforces an active export limit per authenticated requester", async () => {
    vi.stubEnv("PDF_EXPORT_MAX_ACTIVE_PER_USER", "1");
    await enqueuePdfExport({
      resumeUserId: "user-demo",
      resumeId: "resume-demo",
      requesterUserId: "user-demo",
      document: createDefaultResumeDocument(),
      filename: "first.pdf",
      queueLimit: 20,
    });

    await expect(
      enqueuePdfExport({
        resumeUserId: "user-demo",
        resumeId: "resume-demo",
        requesterUserId: "user-demo",
        document: createDefaultResumeDocument(),
        filename: "second.pdf",
        queueLimit: 20,
      }),
    ).rejects.toBeInstanceOf(PdfExportUserQueueLimitError);
  });

  it("force-deletes jobs after the configured maximum lifetime", async () => {
    vi.stubEnv("PDF_EXPORT_FORCE_EXPIRY_MS", "1000");
    const queued = await enqueue();

    await db
      .update(pdfExportJobs)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(pdfExportJobs.id, queued.jobId));

    await deleteExpiredPdfExportResults();

    await expect(
      getPdfExportStatus({
        jobId: queued.jobId,
        requesterUserId: "user-demo",
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("denies worker document access after the forced lifetime", async () => {
    vi.stubEnv("PDF_EXPORT_FORCE_EXPIRY_MS", "1000");
    const queued = await enqueue();
    const [job] = await claimPdfExportJobs({
      workerId: "worker-one",
      maxConcurrency: 1,
      leaseMs: 30_000,
    });
    const { createPdfExportWorkerToken } = await import(
      "@/lib/pdf/export-queue"
    );

    await db
      .update(pdfExportJobs)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(pdfExportJobs.id, queued.jobId));

    await expect(
      getPdfExportDocumentForWorker({
        jobId: job!.id,
        workerToken: createPdfExportWorkerToken(job!.id),
      }),
    ).rejects.toBeInstanceOf(PdfExportNotFoundError);
  });
});
