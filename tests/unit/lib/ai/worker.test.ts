import {
  getAiWorkerConfiguration,
  runAiWorker,
  type AiWorkerOperations,
} from "@/lib/ai/worker";

function createOperations(
  overrides: Partial<AiWorkerOperations> = {},
): AiWorkerOperations {
  return {
    claimQueuedRuns: vi.fn().mockResolvedValue([]),
    deleteExpiredAuditEvidence: vi.fn().mockResolvedValue({
      acquired: true,
      deletedEvidence: 0,
    }),
    recordHeartbeat: vi.fn().mockResolvedValue(undefined),
    executeRun: vi.fn().mockResolvedValue(undefined),
    recoverExpiredRuns: vi.fn().mockResolvedValue({
      acquired: true,
      interrupted: 0,
      releasedPoints: 0,
      settlementPending: 0,
    }),
    ...overrides,
  };
}

describe("AI worker", () => {
  it("uses bounded production defaults and rejects invalid overrides", () => {
    expect(getAiWorkerConfiguration({})).toEqual({
      batchSize: 100,
      pollIntervalMs: 5_000,
      recoveryIntervalMs: 15_000,
      retentionIntervalMs: 3_600_000,
    });
    expect(
      getAiWorkerConfiguration({
        AI_WORKER_BATCH_SIZE: "25",
        AI_WORKER_POLL_INTERVAL_MS: "1000",
        AI_WORKER_RECOVERY_INTERVAL_MS: "5000",
        AI_WORKER_RETENTION_INTERVAL_MS: "60000",
      }),
    ).toEqual({
      batchSize: 25,
      pollIntervalMs: 1_000,
      recoveryIntervalMs: 5_000,
      retentionIntervalMs: 60_000,
    });
    expect(() =>
      getAiWorkerConfiguration({ AI_WORKER_BATCH_SIZE: "0" }),
    ).toThrow("AI_WORKER_BATCH_SIZE");
    expect(() =>
      getAiWorkerConfiguration({
        AI_WORKER_POLL_INTERVAL_MS: "20000",
        AI_WORKER_RECOVERY_INTERVAL_MS: "10000",
      }),
    ).toThrow("AI_WORKER_RECOVERY_INTERVAL_MS");
  });

  it("runs recovery and retention immediately and records its heartbeat", async () => {
    const controller = new AbortController();
    const recoverExpiredRuns = vi.fn().mockImplementation(async () => {
      controller.abort();
      return {
        acquired: true as const,
        interrupted: 0,
        releasedPoints: 0,
        settlementPending: 0,
      };
    });
    const operations = createOperations({ recoverExpiredRuns });

    await runAiWorker({
      configuration: {
        batchSize: 10,
        pollIntervalMs: 1_000,
        recoveryIntervalMs: 5_000,
        retentionIntervalMs: 60_000,
      },
      now: () => new Date("2026-09-19T00:00:00.000Z"),
      operations,
      signal: controller.signal,
      workerId: "ai-worker-test",
    });

    expect(operations.recordHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        workerId: "ai-worker-test",
        workerType: "ai-runtime",
      }),
    );
    expect(recoverExpiredRuns).toHaveBeenCalledWith({ batchSize: 10 });
    expect(operations.deleteExpiredAuditEvidence).toHaveBeenCalledWith({
      batchSize: 10,
    });
  });

  it("claims and executes queued runs outside the request process", async () => {
    const controller = new AbortController();
    const prepared = { runId: "run-one" } as never;
    const executeRun = vi.fn().mockImplementation(async () => {
      controller.abort();
    });
    const operations = createOperations({
      claimQueuedRuns: vi.fn().mockResolvedValueOnce([prepared]),
      executeRun,
    });

    await runAiWorker({
      configuration: {
        batchSize: 10,
        pollIntervalMs: 1_000,
        recoveryIntervalMs: 5_000,
        retentionIntervalMs: 60_000,
      },
      encryptionKey: Buffer.alloc(32, 1),
      leaseSeconds: 90,
      operations,
      signal: controller.signal,
      workerId: "ai-worker-execution",
    });

    expect(operations.claimQueuedRuns).toHaveBeenCalledWith({
      workerId: "ai-worker-execution",
      limit: 1,
      leaseSeconds: 90,
      encryptionKey: Buffer.alloc(32, 1),
    });
    expect(executeRun).toHaveBeenCalledWith(
      prepared,
      controller.signal,
    );
  });

  it("keeps recovery and retention on independent cadences", async () => {
    const controller = new AbortController();
    const operations = createOperations();
    let currentMs = 0;
    let waits = 0;

    await runAiWorker({
      configuration: {
        batchSize: 10,
        pollIntervalMs: 100,
        recoveryIntervalMs: 200,
        retentionIntervalMs: 300,
      },
      now: () => new Date(currentMs),
      operations,
      signal: controller.signal,
      wait: async (ms) => {
        currentMs += ms;
        waits += 1;
        if (waits === 4) controller.abort();
      },
      workerId: "ai-worker-cadence",
    });

    expect(operations.recordHeartbeat).toHaveBeenCalledTimes(4);
    expect(operations.recoverExpiredRuns).toHaveBeenCalledTimes(2);
    expect(operations.deleteExpiredAuditEvidence).toHaveBeenCalledTimes(2);
  });

  it("reports a transient task failure and continues serving", async () => {
    const controller = new AbortController();
    const logger = { error: vi.fn(), info: vi.fn() };
    const recoverExpiredRuns = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockImplementationOnce(async () => {
        controller.abort();
        return {
          acquired: true as const,
          interrupted: 0,
          releasedPoints: 0,
          settlementPending: 0,
        };
      });
    let currentMs = 0;

    await runAiWorker({
      configuration: {
        batchSize: 10,
        pollIntervalMs: 100,
        recoveryIntervalMs: 100,
        retentionIntervalMs: 1_000,
      },
      logger,
      now: () => new Date(currentMs),
      operations: createOperations({ recoverExpiredRuns }),
      signal: controller.signal,
      wait: async (ms) => {
        currentMs += ms;
      },
      workerId: "ai-worker-resilient",
    });

    expect(recoverExpiredRuns).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      "[AnonResume] AI worker recovery failed",
      expect.any(Error),
    );
  });
});
