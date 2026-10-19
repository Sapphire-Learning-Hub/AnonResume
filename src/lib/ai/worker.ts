import {
  runAiRecoveryMaintenance,
  runAiRetentionMaintenance,
} from "@/lib/ai/maintenance";
import {
  getAiCredentialSecretKeys,
  resolveAiConfiguration,
} from "@/lib/ai/config/configuration";
import { createAiProviderAdapter } from "@/lib/ai/providers/registry";
import { executePreparedAiRun } from "@/lib/ai/runs/executor";
import { claimQueuedAiRuns } from "@/lib/ai/runs/queue";
import type { ClaimedAiRun } from "@/lib/ai/runs/service";
import type { ManagedConfig } from "@/lib/config/registry";
import type { VersionedSecretKeys } from "@/lib/config/secret-keyring";
import {
  getRuntimeConfigManager,
  type RuntimeConfigManager,
} from "@/lib/config/runtime";
import { getApplicationRelease } from "@/lib/runtime/release-metadata";
import { createLeaseOwner } from "@/lib/runtime/instance-identity";
import {
  markWorkerStopped,
  recordWorkerHeartbeat,
} from "@/lib/runtime/worker-heartbeat";
import {
  getLogger,
  serializeSafeError,
} from "@/lib/observability/logging";
import { applicationMetrics } from "@/lib/observability/metrics";
import { withTaskDiagnostics } from "@/lib/observability/diagnostics/tasks";

const runtimeLog = getLogger("anonresume.runtime");

export interface AiWorkerConfiguration {
  batchSize: number;
  pollIntervalMs: number;
  recoveryIntervalMs: number;
  retentionIntervalMs: number;
}

export interface AiWorkerOperations {
  claimQueuedRuns: typeof claimQueuedAiRuns;
  markStopped: typeof markWorkerStopped;
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

type AiRuntimeManager = Pick<
  RuntimeConfigManager,
  "refreshIfDue" | "snapshot" | "start"
>;

export function getAiWorkerConfiguration(
  values: Readonly<ManagedConfig>,
): Readonly<AiWorkerConfiguration> {
  return Object.freeze({
    batchSize: values.aiWorkerBatchSize,
    pollIntervalMs: values.aiWorkerPollIntervalMs,
    recoveryIntervalMs: values.aiWorkerRecoveryIntervalMs,
    retentionIntervalMs: values.aiWorkerRetentionIntervalMs,
  });
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
  sessionId?: string;
  encryptionKey?: Buffer;
  credentialKeys?: VersionedSecretKeys;
  runtimeManager?: AiRuntimeManager;
  operations?: AiWorkerOperations;
  logger?: AiWorkerLogger;
  now?: () => Date;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
} = {}) {
  const runtime =
    options.runtimeManager ?? getRuntimeConfigManager("ai-worker");
  await runtime.start();
  const initialSnapshot = await runtime.snapshot();
  const credentialKeys = options.credentialKeys ??
    (options.encryptionKey
      ? { current: options.encryptionKey, legacy: options.encryptionKey }
      : getAiCredentialSecretKeys());
  const encryptionKey = credentialKeys.current;
  const workerId = options.workerId ?? initialSnapshot.instanceId;
  const sessionId = options.sessionId ?? initialSnapshot.sessionId ?? workerId;
  const leaseOwner = createLeaseOwner({ stableId: workerId, sessionId });
  const operations = options.operations ?? {
    claimQueuedRuns: claimQueuedAiRuns,
    deleteExpiredAuditEvidence: runAiRetentionMaintenance,
    markStopped: markWorkerStopped,
    recordHeartbeat: recordWorkerHeartbeat,
    recoverExpiredRuns: runAiRecoveryMaintenance,
    async executeRun(prepared: ClaimedAiRun, signal?: AbortSignal) {
      const adapter = createAiProviderAdapter("openai-compatible");
      for await (const event of executePreparedAiRun(prepared, {
        adapter,
        signal,
      })) {
        if (event.type === "error") throw Object.assign(new Error("ai_run_failed"), { code: event.code === "stopped" ? "aborted" : event.code });
      }
    },
  };
  const logger = options.logger ?? {
    info: (message: string) => console.info(message),
    error: (_message: string, error: unknown) => runtimeLog.error("worker_operation_failed", { error: serializeSafeError(error), outcome: "failure" }),
  };
  const now = options.now ?? (() => new Date());
  const wait = options.wait ?? waitForNextPoll;
  const startedAt = now();
  const release = getApplicationRelease();
  let nextRecoveryAt = 0;
  let nextRetentionAt = 0;
  let activeExecution: Promise<void> | undefined;
  let heartbeatFailed = false;

  logger.info(`[AnonResume] AI worker started: ${workerId}`);
  runtimeLog.info("worker_started", {
    labels: { workerType: "ai-runtime" },
    outcome: "success",
  });

  while (!options.signal?.aborted) {
    await runtime.refreshIfDue();
    const snapshot = await runtime.snapshot();
    const aiConfiguration = resolveAiConfiguration(
      snapshot.values,
      credentialKeys,
    );
    const configuration = getAiWorkerConfiguration(snapshot.values);
    const current = now();
    const currentMs = current.getTime();

    try {
      await operations.recordHeartbeat({
        workerId,
        sessionId,
        workerType: "ai-runtime",
        release,
        startedAt,
        now: current,
        metadata: {
          batchSize: configuration.batchSize,
          configurationHealth: snapshot.health,
          desiredRevisionId: snapshot.desiredRevisionId,
          enabled: aiConfiguration.enabled,
          hotRevisionId: snapshot.hotRevisionId,
          pollIntervalMs: configuration.pollIntervalMs,
          recoveryIntervalMs: configuration.recoveryIntervalMs,
          restartRevisionId: snapshot.restartRevisionId,
          retentionIntervalMs: configuration.retentionIntervalMs,
        },
      });
      applicationMetrics.recordWorkerHeartbeat({
        outcome: "success",
        workerType: "ai",
      });
      if (heartbeatFailed) {
        heartbeatFailed = false;
        runtimeLog.info("worker_heartbeat_recovered", {
          labels: { workerType: "ai-runtime" },
          outcome: "success",
        });
      }
    } catch (error) {
      applicationMetrics.recordWorkerHeartbeat({
        outcome: "failure",
        workerType: "ai",
      });
      applicationMetrics.recordWorkerOperationFailure({
        operation: "heartbeat",
        workerType: "ai",
      });
      logger.error("[AnonResume] AI worker heartbeat failed", error);
      if (!heartbeatFailed) {
        heartbeatFailed = true;
        runtimeLog.error("worker_heartbeat_failed", {
          error: serializeSafeError(error),
          labels: { workerType: "ai-runtime" },
          outcome: "failure",
        });
      }
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
        applicationMetrics.recordWorkerOperationFailure({
          operation: "recovery",
          workerType: "ai",
        });
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
        applicationMetrics.recordWorkerOperationFailure({
          operation: "retention",
          workerType: "ai",
        });
        logger.error("[AnonResume] AI worker retention failed", error);
      } finally {
        nextRetentionAt = currentMs + configuration.retentionIntervalMs;
      }
    }

    if (
      !activeExecution &&
      aiConfiguration.enabled &&
      !options.signal?.aborted
    ) {
      try {
        const [prepared] = await operations.claimQueuedRuns({
          workerId: leaseOwner,
          limit: 1,
          leaseSeconds: aiConfiguration.runLeaseSeconds,
          credentialKeys,
          encryptionKey,
        });
        if (prepared) {
          const executionStartedAt = process.hrtime.bigint();
          applicationMetrics.recordJobStarted({
            aiTaskType: prepared.kind ?? "conversation",
            jobType: "ai",
            queueWaitSeconds: Math.max(
              0,
              (current.getTime() - prepared.queuedAt.getTime()) / 1_000,
            ),
          });
          const claimedConfiguration = Object.freeze({
            ...prepared.configuration,
            credentialKeys,
            credentialsEncryptionKey: encryptionKey,
            runLeaseSeconds: aiConfiguration.runLeaseSeconds,
            streamCheckpointMs: aiConfiguration.streamCheckpointMs,
          });
          const claimed = {
            ...prepared,
            configuration: claimedConfiguration,
          };
          const execution = withTaskDiagnostics(claimed.runId, claimed.diagnosticContext, "ai", () => operations.executeRun(claimed, options.signal))
            .then(() => {
              applicationMetrics.recordJobCompleted({
                aiTaskType: prepared.kind ?? "conversation",
                durationSeconds: Number(
                  process.hrtime.bigint() - executionStartedAt,
                ) / 1_000_000_000,
                jobType: "ai",
                outcome: "success",
              });
            })
            .catch((error) => {
              applicationMetrics.recordJobCompleted({
                aiTaskType: prepared.kind ?? "conversation",
                durationSeconds: Number(
                  process.hrtime.bigint() - executionStartedAt,
                ) / 1_000_000_000,
                jobType: "ai",
                outcome: "failure",
              });
              logger.error("[AnonResume] AI worker execution failed", error);
            })
            .finally(() => {
              if (activeExecution === execution) activeExecution = undefined;
            });
          activeExecution = execution;
        }
      } catch (error) {
        applicationMetrics.recordWorkerOperationFailure({
          operation: "claim",
          workerType: "ai",
        });
        logger.error("[AnonResume] AI worker queue claim failed", error);
      }
    }

    if (options.signal?.aborted) break;
    await wait(configuration.pollIntervalMs, options.signal);
  }

  await activeExecution;

  try {
    await operations.markStopped({ workerId, sessionId });
  } catch (error) {
    logger.error("[AnonResume] AI worker stop heartbeat failed", error);
  }

  logger.info(`[AnonResume] AI worker stopped: ${workerId}`);
  runtimeLog.info("worker_stopped", {
    labels: { workerType: "ai-runtime" },
    outcome: "success",
  });
}
