import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import {
  runAiRecoveryMaintenance,
  runAiRetentionMaintenance,
} from "@/lib/ai/maintenance";
import { createAiProviderAdapter } from "@/lib/ai/providers/registry";
import { executePreparedAiRun } from "@/lib/ai/runs/executor";
import { claimQueuedAiRuns } from "@/lib/ai/runs/queue";
import type { ClaimedAiRun } from "@/lib/ai/runs/service";
import { getApplicationRelease } from "@/lib/runtime/release-metadata";
import { recordWorkerHeartbeat } from "@/lib/runtime/worker-heartbeat";

const DEFAULT_CONFIGURATION = {
  batchSize: 100,
  pollIntervalMs: 5_000,
  recoveryIntervalMs: 15_000,
  retentionIntervalMs: 3_600_000,
} as const;

export interface AiWorkerConfiguration {
  batchSize: number;
  pollIntervalMs: number;
  recoveryIntervalMs: number;
  retentionIntervalMs: number;
}

export interface AiWorkerOperations {
  claimQueuedRuns: typeof claimQueuedAiRuns;
  recordHeartbeat: typeof recordWorkerHeartbeat;
  recoverExpiredRuns: typeof runAiRecoveryMaintenance;
  deleteExpiredAuditEvidence: typeof runAiRetentionMaintenance;
  executeRun: (
    prepared: ClaimedAiRun,
    signal?: AbortSignal,
  ) => Promise<void>;
}

interface AiWorkerLogger {
  error(message: string, error: unknown): void;
  info(message: string): void;
}

type WorkerEnvironment = Record<string, string | undefined>;

function parseInteger(
  environment: WorkerEnvironment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const rawValue = environment[name]?.trim();
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

export function getAiWorkerConfiguration(
  environment: WorkerEnvironment = process.env,
): AiWorkerConfiguration {
  const configuration = {
    batchSize: parseInteger(
      environment,
      "AI_WORKER_BATCH_SIZE",
      DEFAULT_CONFIGURATION.batchSize,
      1,
      1_000,
    ),
    pollIntervalMs: parseInteger(
      environment,
      "AI_WORKER_POLL_INTERVAL_MS",
      DEFAULT_CONFIGURATION.pollIntervalMs,
      250,
      60_000,
    ),
    recoveryIntervalMs: parseInteger(
      environment,
      "AI_WORKER_RECOVERY_INTERVAL_MS",
      DEFAULT_CONFIGURATION.recoveryIntervalMs,
      250,
      3_600_000,
    ),
    retentionIntervalMs: parseInteger(
      environment,
      "AI_WORKER_RETENTION_INTERVAL_MS",
      DEFAULT_CONFIGURATION.retentionIntervalMs,
      1_000,
      86_400_000,
    ),
  };

  if (configuration.recoveryIntervalMs < configuration.pollIntervalMs) {
    throw new Error(
      "AI_WORKER_RECOVERY_INTERVAL_MS must be greater than or equal to AI_WORKER_POLL_INTERVAL_MS",
    );
  }
  if (configuration.retentionIntervalMs < configuration.pollIntervalMs) {
    throw new Error(
      "AI_WORKER_RETENTION_INTERVAL_MS must be greater than or equal to AI_WORKER_POLL_INTERVAL_MS",
    );
  }
  return configuration;
}

function waitForNextPoll(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const finish = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

export async function runAiWorker(options: {
  signal?: AbortSignal;
  workerId?: string;
  encryptionKey?: Buffer;
  leaseSeconds?: number;
  configuration?: AiWorkerConfiguration;
  operations?: AiWorkerOperations;
  logger?: AiWorkerLogger;
  now?: () => Date;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
} = {}) {
  const configuration =
    options.configuration ?? getAiWorkerConfiguration(process.env);
  const workerId =
    options.workerId ?? `${hostname()}:${process.pid}:${randomUUID()}`;
  const operations = options.operations ?? {
    claimQueuedRuns: claimQueuedAiRuns,
    deleteExpiredAuditEvidence: runAiRetentionMaintenance,
    recordHeartbeat: recordWorkerHeartbeat,
    recoverExpiredRuns: runAiRecoveryMaintenance,
    async executeRun(prepared: ClaimedAiRun, signal?: AbortSignal) {
      const adapter = createAiProviderAdapter("openai-compatible");
      for await (const event of executePreparedAiRun(prepared, {
        adapter,
        signal,
      })) {
        void event;
      }
    },
  };
  const logger = options.logger ?? console;
  const now = options.now ?? (() => new Date());
  const wait = options.wait ?? waitForNextPoll;
  const startedAt = now();
  const release = getApplicationRelease();
  let nextRecoveryAt = 0;
  let nextRetentionAt = 0;
  let activeExecution: Promise<void> | undefined;

  logger.info(`[AnonResume] AI worker started: ${workerId}`);

  while (!options.signal?.aborted) {
    const current = now();
    const currentMs = current.getTime();

    try {
      await operations.recordHeartbeat({
        workerId,
        workerType: "ai-runtime",
        release,
        startedAt,
        now: current,
        metadata: {
          batchSize: configuration.batchSize,
          recoveryIntervalMs: configuration.recoveryIntervalMs,
          retentionIntervalMs: configuration.retentionIntervalMs,
        },
      });
    } catch (error) {
      logger.error("[AnonResume] AI worker heartbeat failed", error);
    }

    if (currentMs >= nextRecoveryAt) {
      try {
        const result = await operations.recoverExpiredRuns({
          batchSize: configuration.batchSize,
        });
        if (result.acquired && (result.interrupted || result.settlementPending)) {
          logger.info(
            `[AnonResume] AI worker recovered runs: interrupted=${result.interrupted}, settlementPending=${result.settlementPending}`,
          );
        }
      } catch (error) {
        logger.error("[AnonResume] AI worker recovery failed", error);
      } finally {
        nextRecoveryAt = currentMs + configuration.recoveryIntervalMs;
      }
    }

    if (currentMs >= nextRetentionAt) {
      try {
        const result = await operations.deleteExpiredAuditEvidence({
          batchSize: configuration.batchSize,
        });
        if (result.acquired && result.deletedEvidence) {
          logger.info(
            `[AnonResume] AI worker deleted audit evidence: count=${result.deletedEvidence}`,
          );
        }
      } catch (error) {
        logger.error("[AnonResume] AI worker retention failed", error);
      } finally {
        nextRetentionAt = currentMs + configuration.retentionIntervalMs;
      }
    }

    if (!activeExecution && options.encryptionKey && !options.signal?.aborted) {
      try {
        const [prepared] = await operations.claimQueuedRuns({
          workerId,
          limit: 1,
          leaseSeconds: options.leaseSeconds ?? 90,
          encryptionKey: options.encryptionKey,
        });
        if (prepared) {
          const execution = operations
            .executeRun(prepared, options.signal)
            .catch((error) => {
              logger.error("[AnonResume] AI worker execution failed", error);
            })
            .finally(() => {
              if (activeExecution === execution) activeExecution = undefined;
            });
          activeExecution = execution;
        }
      } catch (error) {
        logger.error("[AnonResume] AI worker queue claim failed", error);
      }
    }

    if (options.signal?.aborted) break;
    await wait(configuration.pollIntervalMs, options.signal);
  }

  await activeExecution;

  logger.info(`[AnonResume] AI worker stopped: ${workerId}`);
}
