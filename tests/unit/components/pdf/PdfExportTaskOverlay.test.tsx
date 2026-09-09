import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const feedbackMocks = vi.hoisted(() => ({
  notificationDestroy: vi.fn(),
  notificationError: vi.fn(),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    notification: {
      destroy: feedbackMocks.notificationDestroy,
      error: feedbackMocks.notificationError,
    },
  }),
}));

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
    vi.useRealTimers();
  });

  it("waits for the requested delay before polling a queued task again", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              job: {
                id: "job-one",
                accessToken: "capability-token",
                status: "queued",
              },
            }),
            { status: 202, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({
            job: {
              id: "job-one",
              status: "queued",
              position: 1,
              queuedCount: 1,
              cancelRequested: false,
              filename: "resume.pdf",
              pollAfterMs: 2_000,
              workerAvailable: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    await startResumePdfExport("resume-demo");
    const view = render(<PdfExportTaskOverlay />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it("collapses an active task panel without discarding its tracker", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            job: {
              id: "job-collapsible",
              accessToken: "capability-token",
              status: "queued",
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          job: {
            id: "job-collapsible",
            status: "queued",
            position: 1,
            queuedCount: 1,
            cancelRequested: false,
            filename: "resume.pdf",
            pollAfterMs: 2_000,
            workerAvailable: true,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await startResumePdfExport("resume-demo");
    const view = render(<PdfExportTaskOverlay />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const statusButton = screen.getByRole("button", {
      name: "收起 PDF 导出状态",
    });
    expect(statusButton).toHaveAttribute("aria-expanded", "true");
    expect(statusButton).not.toHaveClass("ant-float-btn-primary");
    expect(screen.queryByRole("button", { name: "清除已结束记录" }))
      .not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "收起 PDF 导出状态" }),
    );

    expect(screen.getByRole("complementary", { hidden: true })).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "查看 PDF 导出状态" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(getPdfExportTasksSnapshot()).toHaveLength(1);
    view.unmount();
  });

  it("confirms before cancelling an active export task", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              job: {
                id: "job-cancel",
                accessToken: "capability-token",
                status: "queued",
              },
            }),
            { status: 202, headers: { "content-type": "application/json" } },
          );
        }
        if (init?.method === "DELETE") {
          return new Response(
            JSON.stringify({ job: { id: "job-cancel", status: "cancelled" } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            job: {
              id: "job-cancel",
              status: "queued",
              position: 1,
              queuedCount: 1,
              cancelRequested: false,
              filename: "resume.pdf",
              pollAfterMs: 10_000,
              workerAvailable: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    await startResumePdfExport("resume-demo");
    const view = render(<PdfExportTaskOverlay />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "取消任务" }));
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(false);

    const dialog = screen.getByRole("dialog", { name: "取消 PDF 导出" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "确认取消" }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE"),
    ).toBe(true);
    view.unmount();
  });

  it("clears terminal task history and removes the export status button", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "pdf_worker_unavailable" }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );

    await startResumePdfExport("resume-demo");
    const view = render(<PdfExportTaskOverlay />);

    expect(screen.queryByRole("button", { name: "关闭" }))
      .not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清除已结束记录" }));

    expect(
      screen.queryByRole("button", { name: /PDF 导出状态/ }),
    ).not.toBeInTheDocument();
    expect(getPdfExportTasksSnapshot()).toHaveLength(0);
    view.unmount();
  });

  it("explains the configured per-user export limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "user_queue_limit", limit: 3 }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );

    await startResumePdfExport("resume-demo");
    const view = render(<PdfExportTaskOverlay />);

    expect(
      screen.getByText(
        "你最多可以同时提交 3 个导出任务。请等待任务完成或先取消一个任务。",
      ),
    ).toBeInTheDocument();
    expect(feedbackMocks.notificationError).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: false,
        key: expect.stringMatching(/^pdf-export-failed-/),
      }),
    );
    view.unmount();
  });

  it("explains when the PDF worker is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "pdf_worker_unavailable" }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );

    await startResumePdfExport("resume-demo");
    const view = render(<PdfExportTaskOverlay />);

    expect(
      screen.getByText("PDF 导出服务暂时不可用，请稍后再试。"),
    ).toBeInTheDocument();
    view.unmount();
  });

  it("shows that an existing task will remain queued while the worker is offline", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            job: {
              id: "job-offline",
              accessToken: "capability-token",
              status: "queued",
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          job: {
            id: "job-offline",
            status: "queued",
            position: 1,
            queuedCount: 1,
            cancelRequested: false,
            filename: "resume.pdf",
            pollAfterMs: 30_000,
            workerAvailable: false,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await startResumePdfExport("resume-demo");
    const view = render(<PdfExportTaskOverlay />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText("导出服务暂时不可用，任务将继续排队"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it("pauses polling while the page is hidden and resumes when visible", async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              job: {
                id: "job-hidden",
                accessToken: "capability-token",
                status: "queued",
              },
            }),
            { status: 202, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({
            job: {
              id: "job-hidden",
              status: "queued",
              position: 1,
              queuedCount: 1,
              cancelRequested: false,
              pollAfterMs: 2_000,
              workerAvailable: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    await startResumePdfExport("resume-demo");
    const view = render(<PdfExportTaskOverlay />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
