import { getOptionalSession } from "@/lib/auth/session";
import { getPdfExportWorkerAvailability } from "@/lib/pdf/export-availability";
import {
  claimPdfExportJobs,
  completePdfExport,
  enqueuePdfExport,
  getPdfExportQueueConfig,
} from "@/lib/pdf/export-queue";
import { getManagedConfigDefaults } from "@/lib/config/registry";
import {
  createGeneratedResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";

import { DELETE, GET } from "@/app/api/pdf-exports/[id]/route";
import { GET as DOWNLOAD } from "@/app/api/pdf-exports/[id]/download/route";

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: vi.fn(),
}));

vi.mock("@/lib/pdf/export-availability", () => ({
  getPdfExportWorkerAvailability: vi.fn(),
  PDF_EXPORT_ACTIVE_POLL_MS: 2_000,
  PDF_EXPORT_OFFLINE_POLL_MS: 30_000,
}));

describe("PDF export job routes", () => {
  const configuration = getPdfExportQueueConfig(getManagedConfigDefaults());

  beforeEach(async () => {
    vi.mocked(getOptionalSession).mockResolvedValue(null);
    vi.mocked(getPdfExportWorkerAvailability).mockResolvedValue({
      available: true,
    });
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-demo",
    });
  });

  afterEach(async () => {
    await resetResumeRepository();
  });

  async function createPublicJob() {
    return enqueuePdfExport(
      {
        resumeUserId: "user-demo",
        resumeId: "resume-demo",
        document: (
          await import("@/domain/resume/default-document")
        ).createDefaultResumeDocument(),
        filename: "demo.pdf",
      },
      configuration,
    );
  }

  it("returns queue position and accepts capability-token cancellation", async () => {
    const job = await createPublicJob();
    const context = { params: Promise.resolve({ id: job.jobId }) };
    const response = await GET(
      new Request(`http://localhost/api/pdf-exports/${job.jobId}`, {
        headers: { authorization: `Bearer ${job.accessToken}` },
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      job: { status: "queued", position: 1 },
    });

    const cancelled = await DELETE(
      new Request(`http://localhost/api/pdf-exports/${job.jobId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${job.accessToken}`,
          origin: "http://localhost",
        },
      }),
      context,
    );

    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      job: { status: "cancelled" },
    });
  });

  it("slows queued polling while the PDF worker is unavailable", async () => {
    vi.mocked(getPdfExportWorkerAvailability).mockResolvedValue({
      available: false,
    });
    const job = await createPublicJob();
    const response = await GET(
      new Request(`http://localhost/api/pdf-exports/${job.jobId}`, {
        headers: { authorization: `Bearer ${job.accessToken}` },
      }),
      { params: Promise.resolve({ id: job.jobId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("retry-after")).toBe("30");
    await expect(response.json()).resolves.toMatchObject({
      job: {
        status: "queued",
        pollAfterMs: 30_000,
        workerAvailable: false,
      },
    });
  });

  it("downloads only completed jobs", async () => {
    const queued = await createPublicJob();
    const [claimed] = await claimPdfExportJobs({
      workerId: "worker-one",
      configuration,
    });

    await completePdfExport({
      jobId: claimed!.id,
      workerId: "worker-one",
      result: new Uint8Array([4, 5, 6]),
      configuration,
    });

    const response = await DOWNLOAD(
      new Request(`http://localhost/api/pdf-exports/${queued.jobId}/download`, {
        headers: { authorization: `Bearer ${queued.accessToken}` },
      }),
      { params: Promise.resolve({ id: queued.jobId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="demo.pdf"',
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([4, 5, 6]),
    );
  });

  it("does not accept a capability token from the URL query string", async () => {
    const job = await createPublicJob();
    const response = await GET(
      new Request(
        `http://localhost/api/pdf-exports/${job.jobId}?token=${job.accessToken}`,
      ),
      { params: Promise.resolve({ id: job.jobId }) },
    );

    expect(response.status).toBe(403);
  });
});
