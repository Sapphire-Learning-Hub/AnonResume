import { eq } from "drizzle-orm";

import { db, workerHeartbeats } from "@/db";
import {
  claimPdfExportJobs,
  completePdfExport,
  enqueuePdfExport,
  getPdfExportQueueConfig,
  getPdfExportDownload,
  getPdfExportStatus,
  PdfExportNotFoundError,
} from "@/lib/pdf/export-queue";
import { getManagedConfigDefaults } from "@/lib/config/registry";
import {
  processPdfExportJob,
  runPdfExportWorker,
} from "@/lib/pdf/export-worker";
import {
  createGeneratedResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";

describe("PDF export worker", () => {
  function configuration(overrides: Record<string, unknown> = {}) {
    return getPdfExportQueueConfig({
      ...getManagedConfigDefaults(),
      ...overrides,
    });
  }

  function runtimeManager(overrides: Record<string, unknown> = {}) {
    const values = {
      ...getManagedConfigDefaults(),
      ...overrides,
    };
    return {
      refreshIfDue: vi.fn(),
      snapshot: vi.fn(async () => ({
        consumer: "pdf-worker" as const,
        desiredRevisionId: "revision-1",
        fallbackRevisionId: null,
        health: "healthy" as const,
        hotRevisionId: "revision-1",
        instanceId: "pdf-worker-test-runtime",
        sessionId: "pdf-worker-test-session",
        lastError: null,
        restartRevisionId: "revision-1",
        values,
      })),
      start: vi.fn(),
    };
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
    await db
      .delete(workerHeartbeats)
      .where(eq(workerHeartbeats.workerId, "hot-refresh-worker"));
    await resetResumeRepository();
  });

  it("renders the queued document snapshot and completes the job", async () => {
    const queued = await enqueuePdfExport(
      {
        resumeUserId: "user-demo",
        resumeId: "resume-demo",
        requesterUserId: "user-demo",
        document: (
          await import("@/domain/resume/default-document")
        ).createDefaultResumeDocument(),
        filename: "demo.pdf",
      },
      configuration(),
    );
    const [job] = await claimPdfExportJobs({
      workerId: "worker-one",
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfMaxConcurrency: 1,
      }),
    });
    const exportPdf = vi.fn().mockResolvedValue(new Uint8Array([7, 8, 9]));

    await processPdfExportJob(job!, {
      workerId: "worker-one",
      appOrigin: "https://resume.example.com",
      configuration: configuration({
        pdfLeaseMs: 30_000,
        pdfResultTtlMs: 60_000,
      }),
      exportPdf,
    });

    expect(exportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        printUrl: expect.stringMatching(
          /^https:\/\/resume\.example\.com\/pdf-export\/.+\/print$/,
        ),
        requestCookies: [
          expect.objectContaining({
            name: "anonresume_pdf_worker",
            value: expect.stringMatching(/^[0-9a-f]{64}$/),
            domain: "resume.example.com",
            path: "/pdf-export/",
            httpOnly: true,
            secure: true,
            sameSite: "Strict",
          }),
        ],
        readyFlag: "__ANON_RESUME_PRINT_READY__",
        signal: expect.any(AbortSignal),
      }),
    );
    await expect(
      getPdfExportDownload(
        {
          jobId: queued.jobId,
          accessToken: queued.accessToken,
        },
        configuration(),
      ),
    ).resolves.toMatchObject({ result: Buffer.from([7, 8, 9]) });
  });

  it("cleans forced-expired jobs while the queue is otherwise idle", async () => {
    const runtime = runtimeManager({ pdfForceExpiryMs: 1_000 });
    const config = configuration({ pdfForceExpiryMs: 1_000 });
    const queued = await enqueuePdfExport(
      {
        resumeUserId: "user-demo",
        resumeId: "resume-demo",
        requesterUserId: "user-demo",
        document: (
          await import("@/domain/resume/default-document")
        ).createDefaultResumeDocument(),
        filename: "expired.pdf",
      },
      config,
    );
    const { db, pdfExportJobs } = await import("@/db");
    const { eq } = await import("drizzle-orm");

    await db
      .update(pdfExportJobs)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(pdfExportJobs.id, queued.jobId));

    const controller = new AbortController();
    const worker = runPdfExportWorker({
      signal: controller.signal,
      workerId: "idle-cleanup-worker",
      appOrigin: "https://resume.example.com",
      runtimeManager: runtime,
      idlePollMs: 1,
    });

    setTimeout(() => controller.abort(), 10);
    await worker;

    await expect(
      getPdfExportStatus(
        {
          jobId: queued.jobId,
          requesterUserId: "user-demo",
        },
        config,
      ),
    ).rejects.toBeInstanceOf(PdfExportNotFoundError);
  });

  it("uses refreshed concurrency without interrupting an active export", async () => {
    const initialValues = {
      ...getManagedConfigDefaults(),
      pdfMaxConcurrency: 2,
    };
    let snapshot = {
      consumer: "pdf-worker" as const,
      desiredRevisionId: "revision-1",
      fallbackRevisionId: null,
      health: "healthy" as const,
      hotRevisionId: "revision-1",
      instanceId: "pdf-worker-hot-refresh-runtime",
      sessionId: "pdf-worker-hot-refresh-session",
      lastError: null,
      restartRevisionId: "revision-1",
      values: initialValues,
    };
    const runtime = {
      refreshIfDue: vi.fn(),
      snapshot: vi.fn(async () => snapshot),
      start: vi.fn(),
    };
    const controller = new AbortController();
    let releaseFirst!: () => void;
    const firstMayComplete = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let secondJobId = "";
    const processJob = vi.fn(
      async (
        job: Parameters<typeof processPdfExportJob>[0],
        options: Parameters<typeof processPdfExportJob>[1],
      ) => {
        if (processJob.mock.calls.length === 1) {
          await firstMayComplete;
        }
        await completePdfExport({
          jobId: job.id,
          workerId: options.workerId,
          result: new Uint8Array([1]),
          configuration: options.configuration,
        });
        if (job.id === secondJobId) {
          controller.abort();
        }
      },
    );
    const initialConfig = getPdfExportQueueConfig(initialValues);

    await enqueuePdfExport(
      {
        resumeUserId: "user-demo",
        resumeId: "resume-demo",
        requesterUserId: "user-demo",
        document: (
          await import("@/domain/resume/default-document")
        ).createDefaultResumeDocument(),
        filename: "first.pdf",
      },
      initialConfig,
    );
    const worker = runPdfExportWorker({
      signal: controller.signal,
      workerId: "hot-refresh-worker",
      sessionId: "hot-refresh-session",
      appOrigin: "https://resume.example.com",
      runtimeManager: runtime,
      processJob,
      idlePollMs: 1,
    });

    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(1));
    const refreshedValues = {
      ...initialValues,
      pdfMaxConcurrency: 1,
    };
    snapshot = {
      ...snapshot,
      desiredRevisionId: "revision-2",
      hotRevisionId: "revision-2",
      values: refreshedValues,
    };
    const second = await enqueuePdfExport(
      {
        resumeUserId: "user-demo",
        resumeId: "resume-demo",
        requesterUserId: "user-demo",
        document: (
          await import("@/domain/resume/default-document")
        ).createDefaultResumeDocument(),
        filename: "second.pdf",
      },
      getPdfExportQueueConfig(refreshedValues),
    );
    secondJobId = second.jobId;

    await vi.waitFor(async () => {
      const heartbeat = await db.query.workerHeartbeats.findFirst({
        where: eq(workerHeartbeats.workerId, "hot-refresh-worker"),
      });
      expect(heartbeat?.metadata).toMatchObject({
        desiredRevisionId: "revision-2",
        hotRevisionId: "revision-2",
        restartRevisionId: "revision-1",
      });
      expect(heartbeat?.sessionId).toBe("hot-refresh-session");
    });
    expect(processJob).toHaveBeenCalledTimes(1);
    await expect(
      getPdfExportStatus(
        { jobId: second.jobId, requesterUserId: "user-demo" },
        getPdfExportQueueConfig(refreshedValues),
      ),
    ).resolves.toMatchObject({ status: "queued" });

    releaseFirst();
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledTimes(2));
    await worker;
  });
});
