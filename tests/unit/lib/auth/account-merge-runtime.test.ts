import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliverAccountMergeNotices: vi.fn(),
  runAccountMergeExecutor: vi.fn(),
}));

vi.mock("@/lib/auth/account/merge/executor", () => mocks);

import {
  executeAccountMergeMaintenance,
  startAccountMergeRuntime,
  stopAccountMergeRuntime,
} from "@/lib/auth/account/merge/runtime";
import { initializeLogCapture } from "../../../support/observability";

describe("account merge runtime", () => {
  beforeEach(() => {
    stopAccountMergeRuntime();
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.runAccountMergeExecutor.mockResolvedValue({
      completed: 0,
      failed: 0,
      processed: 0,
      waiting: 0,
    });
    mocks.deliverAccountMergeNotices.mockResolvedValue({
      delivered: 0,
      failed: 0,
      processed: 0,
    });
  });

  it("runs operation recovery and durable notice delivery", async () => {
    const capture = initializeLogCapture();
    await executeAccountMergeMaintenance();
    expect(mocks.runAccountMergeExecutor).toHaveBeenCalledOnce();
    expect(mocks.deliverAccountMergeNotices).toHaveBeenCalledOnce();
    expect(capture.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "event.action": "merge_maintenance_completed",
          "event.dataset": "anonresume.account",
          "event.outcome": "success",
        }),
      ]),
    );
  });

  it("does not overlap interval executions", async () => {
    let release!: () => void;
    mocks.runAccountMergeExecutor.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({});
    }));
    startAccountMergeRuntime({ intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.runAccountMergeExecutor).toHaveBeenCalledOnce();
    release();
    await vi.runOnlyPendingTimersAsync();
    stopAccountMergeRuntime();
  });
});
