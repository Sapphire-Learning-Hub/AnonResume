import { eq, inArray } from "drizzle-orm";

import { db, pdfExportJobs } from "@/db";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { getManagedConfigDefaults } from "@/lib/config/registry";
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
  getPdfExportQueueConfig,
  deleteExpiredPdfExportResults,
  PdfExportAccessError,
  PdfExportNotFoundError,
  PdfExportQueueFullError,
  PdfExportUserQueueLimitError,
} from "@/lib/pdf/export-queue";
import {
  createGeneratedResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";

describe("PDF export queue", () => {
  function configuration(overrides: Record<string, unknown> = {}) {
    return getPdfExportQueueConfig({
      ...getManagedConfigDefaults(),
      ...overrides,
    });
  }

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
    return enqueuePdfExport(
      {
        resumeUserId: "user-demo",
        resumeId: "resume-demo",
        requesterUserId: "user-demo",
        document: createDefaultResumeDocument(),
        filename: `resume-${index}.pdf`,
      },
      configuration({
        pdfMaxActivePerUser: 20,
        pdfQueueLimit: 20,
      }),
    );
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
      getPdfExportStatus(
        {
          jobId: second.jobId,
          accessToken: second.accessToken,
        },
        configuration(),
      ),
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
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxConcurrency: 1,
      }),
    });

    await adminCancelPdfExport(running.jobId);
    await adminCancelPdfExport(queued.jobId);

    const rows = await db
      .select({
        id: pdfExportJobs.id,
        status: pdfExportJobs.status,
        cancelRequested: pdfExportJobs.cancelRequested,
      })
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

    const retried = await adminRetryPdfExport(
      failed.jobId,
      configuration({ pdfQueueLimit: 20 }),
    );

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
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxConcurrency: 2,
      }),
    });
    const blocked = await claimPdfExportJobs({
      workerId: "worker-two",
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxConcurrency: 2,
      }),
    });

    expect(claimed.map((job) => job.id)).toEqual([first.jobId, second.jobId]);
    expect(blocked).toEqual([]);
  });

  it("reclaims an expired lease", async () => {
    const queued = await enqueue();

    await claimPdfExportJobs({
      workerId: "dead-worker",
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxConcurrency: 1,
      }),
    });
    await db
      .update(pdfExportJobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(pdfExportJobs.id, queued.jobId));

    const reclaimed = await claimPdfExportJobs({
      workerId: "new-worker",
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxConcurrency: 1,
      }),
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
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxAttempts: 1,
        pdfMaxConcurrency: 1,
      }),
    });
    await db
      .update(pdfExportJobs)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(pdfExportJobs.id, queued.jobId));

    await expect(
      claimPdfExportJobs({
        workerId: "new-worker",
        configuration: configuration({
          pdfLeaseMs: 30_000,
          pdfMaxAttempts: 1,
          pdfMaxConcurrency: 1,
        }),
      }),
    ).resolves.toEqual([]);
    await expect(
      getPdfExportStatus(
        {
          jobId: queued.jobId,
          requesterUserId: "user-demo",
        },
        configuration(),
      ),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("cancels queued jobs immediately and marks running jobs for cancellation", async () => {
    const running = await enqueue(1);
    const queued = await enqueue(2);

    await claimPdfExportJobs({
      workerId: "worker-one",
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxConcurrency: 1,
      }),
    });
    await cancelPdfExport(
      {
        jobId: running.jobId,
        requesterUserId: "user-demo",
      },
      configuration(),
    );
    await cancelPdfExport(
      {
        jobId: queued.jobId,
        requesterUserId: "user-demo",
      },
      configuration(),
    );

    await expect(
      getPdfExportStatus(
        {
          jobId: queued.jobId,
          requesterUserId: "user-demo",
        },
        configuration(),
      ),
    ).resolves.toMatchObject({ status: "cancelled" });
    await expect(
      getPdfExportStatus(
        {
          jobId: running.jobId,
          requesterUserId: "user-demo",
        },
        configuration(),
      ),
    ).resolves.toMatchObject({
      status: "running",
      cancelRequested: true,
    });
  });

  it("stores completed bytes for an authorized download", async () => {
    const queued = await enqueue();
    const [job] = await claimPdfExportJobs({
      workerId: "worker-one",
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxConcurrency: 1,
      }),
    });

    await completePdfExport({
      jobId: job!.id,
      workerId: "worker-one",
      result: new Uint8Array([1, 2, 3]),
      configuration: configuration({ pdfResultTtlMs: 60_000 }),
    });

    await expect(
      getPdfExportDownload(
        {
          jobId: queued.jobId,
          accessToken: queued.accessToken,
        },
        configuration(),
      ),
    ).resolves.toMatchObject({
      filename: "resume-1.pdf",
      result: Buffer.from([1, 2, 3]),
    });
  });

  it("rejects callers without ownership or the capability token", async () => {
    const queued = await enqueue();

    await expect(
      getPdfExportStatus(
        {
          jobId: queued.jobId,
          accessToken: "incorrect-token",
        },
        configuration(),
      ),
    ).rejects.toBeInstanceOf(PdfExportAccessError);
  });

  it("enforces an active export limit per authenticated requester", async () => {
    const config = configuration({ pdfMaxActivePerUser: 1 });
    await enqueuePdfExport(
      {
        resumeUserId: "user-demo",
        resumeId: "resume-demo",
        requesterUserId: "user-demo",
        document: createDefaultResumeDocument(),
        filename: "first.pdf",
      },
      config,
    );

    await expect(
      enqueuePdfExport(
        {
          resumeUserId: "user-demo",
          resumeId: "resume-demo",
          requesterUserId: "user-demo",
          document: createDefaultResumeDocument(),
          filename: "second.pdf",
        },
        config,
      ),
    ).rejects.toBeInstanceOf(PdfExportUserQueueLimitError);
  });

  it("applies a captured queue limit only to the request using it", async () => {
    const limitThree = configuration({
      pdfQueueLimit: 3,
      pdfMaxActivePerUser: 3,
    });
    const limitOne = configuration({
      pdfQueueLimit: 1,
      pdfMaxActivePerUser: 1,
    });
    const request = (index: number) => ({
      resumeUserId: "user-demo",
      resumeId: "resume-demo",
      requesterUserId: `user-${index}`,
      document: createDefaultResumeDocument(),
      filename: `captured-${index}.pdf`,
    });

    await expect(enqueuePdfExport(request(1), limitThree)).resolves.toEqual({
      accessToken: expect.any(String),
      jobId: expect.any(String),
    });
    await expect(enqueuePdfExport(request(2), limitThree)).resolves.toEqual({
      accessToken: expect.any(String),
      jobId: expect.any(String),
    });
    await expect(enqueuePdfExport(request(3), limitOne)).rejects.toBeInstanceOf(
      PdfExportQueueFullError,
    );
  });

  it("force-deletes jobs after the configured maximum lifetime", async () => {
    const config = configuration({ pdfForceExpiryMs: 1_000 });
    const queued = await enqueue();

    await db
      .update(pdfExportJobs)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(pdfExportJobs.id, queued.jobId));

    await deleteExpiredPdfExportResults(config);

    await expect(
      getPdfExportStatus(
        {
          jobId: queued.jobId,
          requesterUserId: "user-demo",
        },
        config,
      ),
    ).rejects.toBeInstanceOf(Error);
  });

  it("denies worker document access after the forced lifetime", async () => {
    const config = configuration({ pdfForceExpiryMs: 1_000 });
    const queued = await enqueue();
    const [job] = await claimPdfExportJobs({
      workerId: "worker-one",
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxConcurrency: 1,
      }),
    });
    const { createPdfExportWorkerToken } =
      await import("@/lib/pdf/export-queue");

    await db
      .update(pdfExportJobs)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(pdfExportJobs.id, queued.jobId));

    await expect(
      getPdfExportDocumentForWorker(
        {
          jobId: job!.id,
          workerToken: createPdfExportWorkerToken(job!.id),
        },
        config,
      ),
    ).rejects.toBeInstanceOf(PdfExportNotFoundError);
  });
});
