import {
  claimPdfExportJobs,
  enqueuePdfExport,
  getPdfExportDownload,
  getPdfExportStatus,
  PdfExportNotFoundError,
} from "@/lib/pdf-export-queue";
import {
  processPdfExportJob,
  runPdfExportWorker,
} from "@/lib/pdf-export-worker";
import {
  createGeneratedResumeRecord,
  resetResumeRepository,
} from "@/lib/resume-repository";

describe("PDF export worker", () => {
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

  it("renders the queued document snapshot and completes the job", async () => {
    const queued = await enqueuePdfExport({
      resumeUserId: "user-demo",
      resumeId: "resume-demo",
      requesterUserId: "user-demo",
      document: (await import("@/domain/resume/default-document")).createDefaultResumeDocument(),
      filename: "demo.pdf",
    });
    const [job] = await claimPdfExportJobs({
      workerId: "worker-one",
      maxConcurrency: 1,
      leaseMs: 30_000,
    });
    const exportPdf = vi.fn().mockResolvedValue(new Uint8Array([7, 8, 9]));

    await processPdfExportJob(job!, {
      workerId: "worker-one",
      appOrigin: "https://resume.example.com",
      leaseMs: 30_000,
      resultTtlMs: 60_000,
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
      getPdfExportDownload({
        jobId: queued.jobId,
        accessToken: queued.accessToken,
      }),
    ).resolves.toMatchObject({ result: Buffer.from([7, 8, 9]) });
  });

  it("cleans forced-expired jobs while the queue is otherwise idle", async () => {
    vi.stubEnv("PDF_EXPORT_FORCE_EXPIRY_MS", "1000");
    const queued = await enqueuePdfExport({
      resumeUserId: "user-demo",
      resumeId: "resume-demo",
      requesterUserId: "user-demo",
      document: (await import("@/domain/resume/default-document")).createDefaultResumeDocument(),
      filename: "expired.pdf",
    });
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
    });

    setTimeout(() => controller.abort(), 10);
    await worker;

    await expect(
      getPdfExportStatus({
        jobId: queued.jobId,
        requesterUserId: "user-demo",
      }),
    ).rejects.toBeInstanceOf(PdfExportNotFoundError);
  });
});
