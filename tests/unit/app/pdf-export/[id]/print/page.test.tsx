import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getManagedConfigDefaults } from "@/lib/config/registry";
import { getRuntimeConfig } from "@/lib/config/runtime";
import {
  getPdfExportDocumentForWorker,
  getPdfExportQueueConfig,
} from "@/lib/pdf/export-queue";

import PdfExportPrintPage from "@/app/pdf-export/[id]/print/page";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));
vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: vi.fn(),
}));
vi.mock("@/lib/pdf/export-queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pdf/export-queue")>()),
  getPdfExportDocumentForWorker: vi.fn(),
}));

describe("PDF export print page", () => {
  beforeEach(() => {
    vi.mocked(getRuntimeConfig).mockResolvedValue({
      values: getManagedConfigDefaults(),
    } as never);
    vi.mocked(notFound).mockClear();
    vi.mocked(getPdfExportDocumentForWorker).mockResolvedValue({
      filename: "resume.pdf",
      document: {} as never,
      status: "running",
    });
  });

  it("reads the worker capability from a scoped HttpOnly cookie", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) =>
        name === "anonresume_pdf_worker"
          ? { name, value: "worker-token" }
          : undefined,
      ),
    } as never);

    await PdfExportPrintPage({
      params: Promise.resolve({ id: "job-one" }),
    });

    expect(getPdfExportDocumentForWorker).toHaveBeenCalledWith(
      {
        jobId: "job-one",
        workerToken: "worker-token",
      },
      getPdfExportQueueConfig(getManagedConfigDefaults()),
    );
  });

  it("rejects requests without the worker cookie", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn(() => undefined),
    } as never);

    await expect(
      PdfExportPrintPage({
        params: Promise.resolve({ id: "job-one" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
