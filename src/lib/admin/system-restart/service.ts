import { and, asc, eq, sql } from "drizzle-orm";

import {
  db,
  systemConfigRevisions,
  systemConfigRuntimeStates,
  systemRestartOperations,
  systemRestartTargets,
} from "@/db";
import type { ConfigConsumer } from "@/lib/config/types";
import { SystemRestartOperationError } from "@/lib/admin/system-restart/errors";
import {
  getActiveSystemRestartOperation,
  getCurrentSystemRestartOperation,
  getSystemRestartOperationById,
  getSystemRestartOperationByIdempotency,
} from "@/lib/runtime/restart/store";
import type { RuntimeSupervisorKind } from "@/lib/runtime/restart/supervisor";
import type { SystemRestartOperationView } from "@/lib/runtime/restart/types";

export { getCurrentSystemRestartOperation };

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const TARGET_ORDER: Record<ConfigConsumer, number> = {
  "pdf-worker": 0,
  "ai-worker": 1,
  web: 2,
};

interface RestartMetadata {
  heartbeatIntervalMs: number;
  restartSupported: boolean;
  supervisorKind: RuntimeSupervisorKind | null;
}

function readRestartMetadata(value: unknown): RestartMetadata {
  const metadata = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const configuredInterval = metadata.configurationPollIntervalMs;
  const heartbeatIntervalMs =
    typeof configuredInterval === "number" &&
      Number.isFinite(configuredInterval) &&
      configuredInterval > 0
      ? configuredInterval
      : DEFAULT_HEARTBEAT_INTERVAL_MS;
  const supervisorKind = metadata.supervisorKind;

  return {
    heartbeatIntervalMs,
    restartSupported: metadata.onlineRestartSupported === true,
    supervisorKind:
      supervisorKind === "docker-compose" || supervisorKind === "systemd"
        ? supervisorKind
        : null,
  };
}

function postgresErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export async function createSystemRestartOperation(input: {
  actorUserId: string;
  deploymentId: string;
  idempotencyKey: string;
  now?: Date;
}): Promise<SystemRestartOperationView> {
  const replay = await getSystemRestartOperationByIdempotency(input);
  if (replay) return replay;

  let operationId: string;

  try {
    operationId = await db.transaction(async (transaction) => {
      const [existingReplay] = await transaction
        .select({ id: systemRestartOperations.id })
        .from(systemRestartOperations)
        .where(
          and(
            eq(systemRestartOperations.actorUserId, input.actorUserId),
            eq(systemRestartOperations.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existingReplay) return existingReplay.id;

      const [activeOperation] = await transaction
        .select({ id: systemRestartOperations.id })
        .from(systemRestartOperations)
        .where(
          and(
            eq(systemRestartOperations.deploymentId, input.deploymentId),
            sql`${systemRestartOperations.status} IN ('queued', 'running')`,
          ),
        )
        .limit(1);
      if (activeOperation) {
        throw new SystemRestartOperationError("operation_active");
      }

      const [activeRevision] = await transaction
        .select({ id: systemConfigRevisions.id })
        .from(systemConfigRevisions)
        .where(eq(systemConfigRevisions.status, "active"))
        .limit(1);
      if (!activeRevision) {
        throw new SystemRestartOperationError("configuration_unavailable");
      }

      const databaseNow = input.now ?? (
        await transaction.execute<{ now: Date }>(
          sql`SELECT now() AS "now"`,
        )
      ).rows[0]?.now;
      if (!databaseNow) {
        throw new SystemRestartOperationError("configuration_unavailable");
      }

      const runtimeRows = await transaction
        .select()
        .from(systemConfigRuntimeStates)
        .where(eq(systemConfigRuntimeStates.status, "running"))
        .orderBy(asc(systemConfigRuntimeStates.instanceId));
      const deploymentPrefix = `${input.deploymentId}/`;
      const deploymentRows = runtimeRows.filter((runtime) =>
        runtime.instanceId.startsWith(deploymentPrefix)
      );

      for (const runtime of deploymentRows) {
        const metadata = readRestartMetadata(runtime.metadata);
        if (
          databaseNow.getTime() - runtime.lastSeenAt.getTime() >
            metadata.heartbeatIntervalMs * 3
        ) {
          throw new SystemRestartOperationError("runtime_stale");
        }
        if (
          runtime.healthState === "degraded" ||
          runtime.healthState === "recovery_required"
        ) {
          throw new SystemRestartOperationError("runtime_unhealthy");
        }
      }

      const targets = deploymentRows
        .filter((runtime) => runtime.healthState === "restart_required")
        .sort((left, right) =>
          TARGET_ORDER[left.consumer] - TARGET_ORDER[right.consumer] ||
          left.instanceId.localeCompare(right.instanceId)
        );
      if (targets.length === 0) {
        throw new SystemRestartOperationError("no_pending_restart");
      }

      const targetRows = targets.map((runtime, sequence) => {
        const metadata = readRestartMetadata(runtime.metadata);
        if (
          runtime.desiredRevisionId !== activeRevision.id ||
          !runtime.loadedHotRevisionId
        ) {
          throw new SystemRestartOperationError("runtime_unhealthy");
        }
        if (!metadata.restartSupported || !metadata.supervisorKind) {
          throw new SystemRestartOperationError("restart_unsupported");
        }

        return {
          consumer: runtime.consumer,
          createdAt: databaseNow,
          desiredRestartRevisionId: activeRevision.id,
          expectedSessionId: runtime.sessionId,
          instanceId: runtime.instanceId,
          sequence,
          status: "queued" as const,
          supervisorKind: metadata.supervisorKind,
          updatedAt: databaseNow,
        };
      });

      const [operation] = await transaction
        .insert(systemRestartOperations)
        .values({
          actorUserId: input.actorUserId,
          createdAt: databaseNow,
          deploymentId: input.deploymentId,
          desiredRevisionId: activeRevision.id,
          idempotencyKey: input.idempotencyKey,
          status: "queued",
          updatedAt: databaseNow,
        })
        .returning({ id: systemRestartOperations.id });
      if (!operation) {
        throw new SystemRestartOperationError("configuration_unavailable");
      }

      await transaction.insert(systemRestartTargets).values(
        targetRows.map((target) => ({ ...target, operationId: operation.id })),
      );
      return operation.id;
    });
  } catch (error) {
    if (error instanceof SystemRestartOperationError) throw error;
    if (postgresErrorCode(error) === "23505") {
      const concurrentReplay = await getSystemRestartOperationByIdempotency(input);
      if (concurrentReplay) return concurrentReplay;
      if (await getActiveSystemRestartOperation(input.deploymentId)) {
        throw new SystemRestartOperationError("operation_active");
      }
    }
    throw error;
  }

  const operation = await getSystemRestartOperationById(operationId);
  if (!operation) {
    throw new SystemRestartOperationError("configuration_unavailable");
  }
  return operation;
}
