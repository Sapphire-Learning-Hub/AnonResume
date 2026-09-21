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
          const execution = operations
            .executeRun(claimed, options.signal)
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

  try {
    await operations.markStopped({ workerId, sessionId });
  } catch (error) {
    logger.error("[AnonResume] AI worker stop heartbeat failed", error);
  }

  logger.info(`[AnonResume] AI worker stopped: ${workerId}`);
}
