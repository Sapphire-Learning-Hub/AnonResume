import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAccountMaintenance: vi.fn(),
  sendAccountSecurityNotice: vi.fn(),
}));

vi.mock("@/lib/auth/account/maintenance", () => ({
  runAccountMaintenance: mocks.runAccountMaintenance,
}));
vi.mock("@/lib/runtime/email", () => ({
  sendAccountSecurityNotice: mocks.sendAccountSecurityNotice,
}));

import {
  startAccountMaintenanceLoop,
  stopAccountMaintenanceLoop,
} from "@/lib/auth/account/maintenance-runtime";

describe("account maintenance runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    stopAccountMaintenanceLoop();
    mocks.runAccountMaintenance.mockResolvedValue({
      processed: 0,
      deleted: 0,
      failed: 0,
    });
  });

  afterEach(() => {
    stopAccountMaintenanceLoop();
    vi.useRealTimers();
  });

  it("starts once, runs immediately, and schedules non-overlapping maintenance", async () => {
    let finishFirstRun: (() => void) | undefined;
    mocks.runAccountMaintenance.mockImplementationOnce(
      () => new Promise((resolve) => {
        finishFirstRun = () => resolve({ processed: 0, deleted: 0, failed: 0 });
      }),
    );

    startAccountMaintenanceLoop({ intervalMs: 60_000 });
    startAccountMaintenanceLoop({ intervalMs: 60_000 });
    await Promise.resolve();

    expect(mocks.runAccountMaintenance).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.runAccountMaintenance).toHaveBeenCalledTimes(1);

    finishFirstRun?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.runAccountMaintenance).toHaveBeenCalledTimes(2);
  });
});
