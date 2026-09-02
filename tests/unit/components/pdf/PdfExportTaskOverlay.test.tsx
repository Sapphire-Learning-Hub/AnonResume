import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PdfExportTaskOverlay } from "@/components/pdf/PdfExportTaskOverlay";
import {
  dismissPdfExportTask,
  getPdfExportTasksSnapshot,
  startResumePdfExport,
} from "@/lib/pdf-export-client";

describe("PdfExportTaskOverlay", () => {
  afterEach(() => {
    for (const task of getPdfExportTasksSnapshot()) {
      dismissPdfExportTask(task.id);
    }

    vi.restoreAllMocks();
  });

  it("explains the configured per-user export limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "user_queue_limit", limit: 3 }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );

    await startResumePdfExport("resume-demo");
    render(<PdfExportTaskOverlay />);

    expect(
      screen.getByText(
        "你最多可以同时提交 3 个导出任务。请等待任务完成或先取消一个任务。",
      ),
    ).toBeInTheDocument();
  });
});
