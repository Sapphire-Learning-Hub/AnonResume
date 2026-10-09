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

describe("account merge runtime", () => {
  beforeEach(() => {
    stopAccountMergeRuntime();
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.runAccountMergeExecutor.mockResolvedValue({});
    mocks.deliverAccountMergeNotices.mockResolvedValue({});
  });

  it("runs operation recovery and durable notice delivery", async () => {
    await executeAccountMergeMaintenance();
    expect(mocks.runAccountMergeExecutor).toHaveBeenCalledOnce();
    expect(mocks.deliverAccountMergeNotices).toHaveBeenCalledOnce();
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
