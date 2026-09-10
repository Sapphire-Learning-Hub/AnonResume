import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dismissPdfExportTask,
  getPdfExportTasksSnapshot,
  refreshPdfExportTask,
  startResumePdfExport,
  type PdfExportClientTask,
} from "@/lib/pdf/export-client";

describe("PDF export client", () => {
  afterEach(() => {
    for (const task of getPdfExportTasksSnapshot()) {
      dismissPdfExportTask(task.id);
    }
    vi.restoreAllMocks();
  });

  it("records a user-visible task when the per-user queue limit is reached", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "user_queue_limit", limit: 3 }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(startResumePdfExport("resume-demo")).resolves.toBeUndefined();
    expect(getPdfExportTasksSnapshot()).toEqual([
      expect.objectContaining({
        status: "failed",
        errorCode: "user_queue_limit",
        errorLimit: 3,
      }),
    ]);
  });

  it("keeps capability tokens in authorization headers during polling and download", async () => {
    const task: PdfExportClientTask = {
      id: "job-one",
      accessToken: "capability-token",
      status: "queued",
      position: 1,
      queuedCount: 1,
      cancelRequested: false,
      downloaded: false,
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job: {
              id: task.id,
              status: "completed",
              position: null,
              queuedCount: 0,
              cancelRequested: false,
              filename: "resume.pdf",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      );
    const createObjectUrl = vi.fn(() => "blob:resume-pdf");
    const revokeObjectUrl = vi.fn();

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await refreshPdfExportTask(task);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/pdf-exports/job-one",
      expect.objectContaining({
        headers: { authorization: "Bearer capability-token" },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/pdf-exports/job-one/download",
      expect.objectContaining({
        headers: { authorization: "Bearer capability-token" },
      }),
    );
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:resume-pdf");
  });
});
