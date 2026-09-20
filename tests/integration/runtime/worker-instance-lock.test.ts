import {
  WorkerInstanceAlreadyRunningError,
  withWorkerInstanceLock,
} from "@/lib/runtime/worker-instance-lock";

describe("worker instance lock", () => {
  it("allows only one live process to own a stable worker identity", async () => {
    let release!: () => void;
    let markAcquired!: () => void;
    const mayFinish = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      markAcquired = resolve;
    });
    const first = withWorkerInstanceLock(
      "default/ai-worker/lock-test",
      async () => {
        markAcquired();
        return mayFinish;
      },
    );

    await acquired;
    await expect(
      withWorkerInstanceLock(
        "default/ai-worker/lock-test",
        async () => undefined,
      ),
    ).rejects.toBeInstanceOf(WorkerInstanceAlreadyRunningError);

    release();
    await first;
    await expect(
      withWorkerInstanceLock(
        "default/ai-worker/lock-test",
        async () => "restarted",
      ),
    ).resolves.toBe("restarted");
  });
});
