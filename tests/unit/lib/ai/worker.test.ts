import {
  getAiWorkerConfiguration,
  runAiWorker,
  type AiWorkerOperations,
} from "@/lib/ai/worker";
import {
  getManagedConfigDefaults,
  parseManagedConfig,
} from "@/lib/config/registry";

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

function runtimeManager(overrides: Record<string, unknown> = {}) {
  const values = {
    ...getManagedConfigDefaults(),
    ...overrides,
  };
  return {
    refreshIfDue: vi.fn(),
    snapshot: vi.fn(async () => ({
      consumer: "ai-worker" as const,
      desiredRevisionId: "revision-1",
      fallbackRevisionId: null,
      health: "healthy" as const,
      hotRevisionId: "revision-1",
      instanceId: "ai-worker-test-runtime",
      lastError: null,
      restartRevisionId: "revision-1",
      values,
    })),
    start: vi.fn(),
  };
}

function preparedRun() {
  return {
    runId: "run-one",
    configuration: {
      credentialsEncryptionKey: Buffer.alloc(32, 8),
      auditRetentionDays: 30,
      defaultMonthlyPoints: 10_000,
      requestsPerMinute: 10,
      streamCheckpointMs: 5_000,
      runLeaseSeconds: 120,
    },
  } as never;
}

describe("AI worker", () => {
  it("uses bounded production defaults and rejects invalid overrides", () => {
    expect(getAiWorkerConfiguration(getManagedConfigDefaults())).toEqual({
      batchSize: 100,
      pollIntervalMs: 5_000,
      recoveryIntervalMs: 15_000,
      retentionIntervalMs: 3_600_000,
    });
    expect(
      getAiWorkerConfiguration({
        ...getManagedConfigDefaults(),
        aiWorkerBatchSize: 25,
        aiWorkerPollIntervalMs: 1_000,
        aiWorkerRecoveryIntervalMs: 5_000,
        aiWorkerRetentionIntervalMs: 60_000,
      }),
    ).toEqual({
      batchSize: 25,
      pollIntervalMs: 1_000,
      recoveryIntervalMs: 5_000,
      retentionIntervalMs: 60_000,
    });
    expect(() =>
      parseManagedConfig({
        aiWorkerBatchSize: 0,
      }),
    ).toThrow("aiWorkerBatchSize");
    expect(() =>
      parseManagedConfig({
        aiWorkerPollIntervalMs: 20_000,
        aiWorkerRecoveryIntervalMs: 10_000,
      }),
    ).toThrow("aiWorkerRecoveryIntervalMs");
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
      runtimeManager: runtimeManager({
        aiWorkerBatchSize: 10,
        aiWorkerPollIntervalMs: 1_000,
        aiWorkerRecoveryIntervalMs: 5_000,
        aiWorkerRetentionIntervalMs: 60_000,
      }),
      now: () => new Date("2026-09-19T00:00:00.000Z"),
      operations,
      signal: controller.signal,
      workerId: "ai-worker-test",
    });

    expect(operations.recordHeartbeat).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          desiredRevisionId: "revision-1",
          hotRevisionId: "revision-1",
          restartRevisionId: "revision-1",
        }),
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
    const prepared = preparedRun();
    const executeRun = vi.fn().mockImplementation(async () => {
      controller.abort();
    });
    const operations = createOperations({
      claimQueuedRuns: vi.fn().mockResolvedValueOnce([prepared]),
      executeRun,
    });

    await runAiWorker({
      encryptionKey: Buffer.alloc(32, 1),
      runtimeManager: runtimeManager({
        aiEnabled: true,
        aiRunLeaseSeconds: 90,
        aiStreamCheckpointMs: 1_000,
        aiWorkerBatchSize: 10,
        aiWorkerPollIntervalMs: 1_000,
        aiWorkerRecoveryIntervalMs: 5_000,
        aiWorkerRetentionIntervalMs: 60_000,
      }),
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
      expect.objectContaining({
        runId: "run-one",
        configuration: expect.objectContaining({
          credentialsEncryptionKey: Buffer.alloc(32, 1),
          runLeaseSeconds: 90,
          streamCheckpointMs: 1_000,
        }),
      }),
      controller.signal,
    );
  });

  it("keeps recovery and retention on independent cadences", async () => {
    const controller = new AbortController();
    const operations = createOperations();
    let currentMs = 0;
    let waits = 0;

    await runAiWorker({
      runtimeManager: runtimeManager({
        aiWorkerBatchSize: 10,
        aiWorkerPollIntervalMs: 250,
        aiWorkerRecoveryIntervalMs: 500,
        aiWorkerRetentionIntervalMs: 750,
      }),
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
      runtimeManager: runtimeManager({
        aiWorkerBatchSize: 10,
        aiWorkerPollIntervalMs: 250,
        aiWorkerRecoveryIntervalMs: 250,
        aiWorkerRetentionIntervalMs: 1_000,
      }),
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

  it("stops new claims after AI is disabled while an active run settles", async () => {
    const controller = new AbortController();
    const initialValues = {
      ...getManagedConfigDefaults(),
      aiEnabled: true,
      aiRunLeaseSeconds: 90,
      aiStreamCheckpointMs: 1_000,
      aiWorkerPollIntervalMs: 250,
      aiWorkerRecoveryIntervalMs: 1_000,
      aiWorkerRetentionIntervalMs: 1_000,
    };
    let snapshot = {
      consumer: "ai-worker" as const,
      desiredRevisionId: "revision-1",
      fallbackRevisionId: null,
      health: "healthy" as const,
      hotRevisionId: "revision-1",
      instanceId: "ai-worker-disable-runtime",
      lastError: null,
      restartRevisionId: "revision-1",
      values: initialValues,
    };
    const runtime = {
      refreshIfDue: vi.fn(),
      snapshot: vi.fn(async () => snapshot),
      start: vi.fn(),
    };
    let finishActive!: () => void;
    const activeMayFinish = new Promise<void>((resolve) => {
      finishActive = resolve;
    });
    const executeRun = vi.fn(async () => activeMayFinish);
    const claimQueuedRuns = vi
      .fn()
      .mockResolvedValueOnce([preparedRun()])
      .mockResolvedValue([preparedRun()]);
    let waits = 0;

    await runAiWorker({
      encryptionKey: Buffer.alloc(32, 1),
      operations: createOperations({ claimQueuedRuns, executeRun }),
      runtimeManager: runtime,
      signal: controller.signal,
      wait: async () => {
        waits += 1;
        if (waits === 1) {
          snapshot = {
            ...snapshot,
            desiredRevisionId: "revision-2",
            hotRevisionId: "revision-2",
            values: { ...initialValues, aiEnabled: false },
          };
        } else if (waits === 2) {
          finishActive();
        } else {
          controller.abort();
        }
      },
      workerId: "ai-worker-disable",
    });

    expect(executeRun).toHaveBeenCalledTimes(1);
    expect(claimQueuedRuns).toHaveBeenCalledTimes(1);
  });
});
