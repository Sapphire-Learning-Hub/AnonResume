import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  db,
  systemRestartOperations,
  systemRestartTargets,
} from "@/db";
import type { SystemRestartOperationView } from "@/lib/runtime/restart/types";

type RestartOperationRow = typeof systemRestartOperations.$inferSelect;

function optionalDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

async function loadOperationView(
  operation: RestartOperationRow | undefined,
): Promise<SystemRestartOperationView | null> {
  if (!operation) return null;

  const targets = await db
    .select()
    .from(systemRestartTargets)
    .where(eq(systemRestartTargets.operationId, operation.id))
    .orderBy(asc(systemRestartTargets.sequence));

  return {
    actorUserId: operation.actorUserId,
    completedAt: optionalDate(operation.completedAt),
    createdAt: operation.createdAt.toISOString(),
    deploymentId: operation.deploymentId,
    desiredRevisionId: operation.desiredRevisionId,
    errorCode: operation.errorCode,
    id: operation.id,
    startedAt: optionalDate(operation.startedAt),
    status: operation.status,
    targets: targets.map((target) => ({
      completedAt: optionalDate(target.completedAt),
      consumer: target.consumer,
      desiredRestartRevisionId: target.desiredRestartRevisionId,
      drainStartedAt: optionalDate(target.drainStartedAt),
      errorCode: target.errorCode,
      exitStartedAt: optionalDate(target.exitStartedAt),
      expectedSessionId: target.expectedSessionId,
      instanceId: target.instanceId,
      sequence: target.sequence,
      status: target.status,
      supervisorKind: target.supervisorKind,
    })),
    updatedAt: operation.updatedAt.toISOString(),
  };
}

export async function getSystemRestartOperationById(id: string) {
  const [operation] = await db
    .select()
    .from(systemRestartOperations)
    .where(eq(systemRestartOperations.id, id))
    .limit(1);
  return loadOperationView(operation);
}

export async function getSystemRestartOperationByIdempotency(input: {
  actorUserId: string;
  idempotencyKey: string;
}) {
  const [operation] = await db
    .select()
    .from(systemRestartOperations)
    .where(
      and(
        eq(systemRestartOperations.actorUserId, input.actorUserId),
        eq(systemRestartOperations.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  return loadOperationView(operation);
}

export async function getActiveSystemRestartOperation(deploymentId: string) {
  const [operation] = await db
    .select()
    .from(systemRestartOperations)
    .where(
      and(
        eq(systemRestartOperations.deploymentId, deploymentId),
        inArray(systemRestartOperations.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  return loadOperationView(operation);
}

export async function getCurrentSystemRestartOperation(input: {
  deploymentId: string;
}): Promise<SystemRestartOperationView | null> {
  const active = await getActiveSystemRestartOperation(input.deploymentId);
  if (active) return active;

  const [operation] = await db
    .select()
    .from(systemRestartOperations)
    .where(eq(systemRestartOperations.deploymentId, input.deploymentId))
    .orderBy(desc(systemRestartOperations.createdAt))
    .limit(1);
  return loadOperationView(operation);
}
