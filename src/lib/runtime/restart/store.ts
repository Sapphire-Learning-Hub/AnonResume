import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  db,
  systemRestartOperations,
  systemRestartTargets,
} from "@/db";
import type { SystemRestartOperationView } from "@/lib/runtime/restart/types";
import type { ConfigConsumer } from "@/lib/config/types";

type RestartOperationRow = typeof systemRestartOperations.$inferSelect;

export interface SystemRestartRuntimeIdentity {
  consumer: ConfigConsumer;
  deploymentId: string;
  sessionId: string;
  stableId: string;
}

export interface SystemRestartTargetClaim {
  consumer: ConfigConsumer;
  expectedSessionId: string;
  instanceId: string;
  operationId: string;
}

interface TransitionInput extends SystemRestartTargetClaim {
  now: Date;
}

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

export async function claimNextSystemRestartTarget(
  input: SystemRestartRuntimeIdentity & { now: Date },
): Promise<SystemRestartTargetClaim | null> {
  return db.transaction(async (transaction) => {
    const [operation] = await transaction
      .select()
      .from(systemRestartOperations)
      .where(
        and(
          eq(systemRestartOperations.deploymentId, input.deploymentId),
          inArray(systemRestartOperations.status, ["queued", "running"]),
        ),
      )
      .limit(1)
      .for("update");
    if (!operation) return null;

    const targets = await transaction
      .select()
      .from(systemRestartTargets)
      .where(eq(systemRestartTargets.operationId, operation.id))
      .orderBy(asc(systemRestartTargets.sequence));
    const target = targets.find((candidate) => candidate.status !== "healthy");
    if (
      !target ||
      target.status !== "queued" ||
      target.instanceId !== input.stableId ||
      target.consumer !== input.consumer ||
      target.expectedSessionId !== input.sessionId
    ) {
      return null;
    }

    const [claimed] = await transaction
      .update(systemRestartTargets)
      .set({
        drainStartedAt: input.now,
        status: "draining",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(systemRestartTargets.operationId, operation.id),
          eq(systemRestartTargets.instanceId, target.instanceId),
          eq(systemRestartTargets.expectedSessionId, input.sessionId),
          eq(systemRestartTargets.status, "queued"),
        ),
      )
      .returning({ instanceId: systemRestartTargets.instanceId });
    if (!claimed) return null;

    await transaction
      .update(systemRestartOperations)
      .set({
        startedAt: operation.startedAt ?? input.now,
        status: "running",
        updatedAt: input.now,
      })
      .where(eq(systemRestartOperations.id, operation.id));

    return {
      consumer: target.consumer,
      expectedSessionId: target.expectedSessionId,
      instanceId: target.instanceId,
      operationId: operation.id,
    };
  });
}

export async function markSystemRestartTargetExiting(input: TransitionInput) {
  const updated = await db
    .update(systemRestartTargets)
    .set({
      exitStartedAt: input.now,
      status: "exiting",
      updatedAt: input.now,
    })
    .where(
      and(
        eq(systemRestartTargets.operationId, input.operationId),
        eq(systemRestartTargets.instanceId, input.instanceId),
        eq(systemRestartTargets.consumer, input.consumer),
        eq(systemRestartTargets.expectedSessionId, input.expectedSessionId),
        eq(systemRestartTargets.status, "draining"),
      ),
    )
    .returning({ instanceId: systemRestartTargets.instanceId });
  return updated.length === 1;
}

export async function markSystemRestartTargetAwaitingStartup(
  input: TransitionInput,
) {
  const updated = await db
    .update(systemRestartTargets)
    .set({ status: "awaiting_startup", updatedAt: input.now })
    .where(
      and(
        eq(systemRestartTargets.operationId, input.operationId),
        eq(systemRestartTargets.instanceId, input.instanceId),
        eq(systemRestartTargets.consumer, input.consumer),
        eq(systemRestartTargets.expectedSessionId, input.expectedSessionId),
        eq(systemRestartTargets.status, "exiting"),
      ),
    )
    .returning({ instanceId: systemRestartTargets.instanceId });
  return updated.length === 1;
}

export async function reconcileSystemRestartTargetStartup(
  input: SystemRestartRuntimeIdentity & {
    healthState: "healthy" | "restart_required" | "degraded" | "recovery_required";
    loadedRestartRevisionId: string | null;
    now: Date;
  },
) {
  return db.transaction(async (transaction) => {
    const [operation] = await transaction
      .select()
      .from(systemRestartOperations)
      .where(
        and(
          eq(systemRestartOperations.deploymentId, input.deploymentId),
          inArray(systemRestartOperations.status, ["queued", "running"]),
        ),
      )
      .limit(1)
      .for("update");
    if (!operation) return null;

    const targets = await transaction
      .select()
      .from(systemRestartTargets)
      .where(eq(systemRestartTargets.operationId, operation.id))
      .orderBy(asc(systemRestartTargets.sequence));
    const target = targets.find((candidate) => candidate.status !== "healthy");
    if (
      !target ||
      target.instanceId !== input.stableId ||
      target.consumer !== input.consumer ||
      target.expectedSessionId === input.sessionId ||
      !["queued", "draining", "exiting", "awaiting_startup"].includes(
        target.status,
      )
    ) {
      return null;
    }

    const errorCode = input.healthState !== "healthy"
      ? "replacement_unhealthy"
      : input.loadedRestartRevisionId !== target.desiredRestartRevisionId
      ? "replacement_wrong_revision"
      : null;
    if (errorCode) {
      await transaction
        .update(systemRestartTargets)
        .set({
          completedAt: input.now,
          errorCode,
          status: "failed",
          updatedAt: input.now,
        })
        .where(
          and(
            eq(systemRestartTargets.operationId, operation.id),
            eq(systemRestartTargets.instanceId, target.instanceId),
            inArray(systemRestartTargets.status, [
              "queued",
              "draining",
              "exiting",
              "awaiting_startup",
            ]),
          ),
        );
      await transaction
        .update(systemRestartOperations)
        .set({
          completedAt: input.now,
          errorCode,
          status: "failed",
          updatedAt: input.now,
        })
        .where(eq(systemRestartOperations.id, operation.id));
      return "failed" as const;
    }

    await transaction
      .update(systemRestartTargets)
      .set({
        completedAt: input.now,
        errorCode: null,
        status: "healthy",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(systemRestartTargets.operationId, operation.id),
          eq(systemRestartTargets.instanceId, target.instanceId),
          inArray(systemRestartTargets.status, [
            "queued",
            "draining",
            "exiting",
            "awaiting_startup",
          ]),
        ),
      );
    const operationComplete = targets.every((candidate) =>
      candidate.instanceId === target.instanceId || candidate.status === "healthy"
    );
    await transaction
      .update(systemRestartOperations)
      .set({
        completedAt: operationComplete ? input.now : null,
        startedAt: operation.startedAt ?? input.now,
        status: operationComplete ? "succeeded" : "running",
        updatedAt: input.now,
      })
      .where(eq(systemRestartOperations.id, operation.id));
    return "healthy" as const;
  });
}

export async function expireSystemRestartTargets(input: {
  now: Date;
  startupTimeoutMs: number;
  workerDrainTimeoutMs: number;
}) {
  return db.transaction(async (transaction) => {
    const operations = await transaction
      .select()
      .from(systemRestartOperations)
      .where(inArray(systemRestartOperations.status, ["queued", "running"]))
      .for("update");
    let expired = 0;

    for (const operation of operations) {
      const targets = await transaction
        .select()
        .from(systemRestartTargets)
        .where(eq(systemRestartTargets.operationId, operation.id))
        .orderBy(asc(systemRestartTargets.sequence));
      const target = targets.find((candidate) => candidate.status !== "healthy");
      if (!target) continue;

      const workerDrainExpired =
        target.consumer !== "web" &&
        target.status === "draining" &&
        target.drainStartedAt !== null &&
        input.now.getTime() - target.drainStartedAt.getTime() >
          input.workerDrainTimeoutMs;
      const startupExpired =
        (target.status === "exiting" || target.status === "awaiting_startup") &&
        target.exitStartedAt !== null &&
        input.now.getTime() - target.exitStartedAt.getTime() >
          input.startupTimeoutMs;
      if (!workerDrainExpired && !startupExpired) continue;

      const errorCode = workerDrainExpired
        ? "worker_drain_timeout"
        : "instance_did_not_return";
      await transaction
        .update(systemRestartTargets)
        .set({
          completedAt: input.now,
          errorCode,
          status: "timed_out",
          updatedAt: input.now,
        })
        .where(
          and(
            eq(systemRestartTargets.operationId, operation.id),
            eq(systemRestartTargets.instanceId, target.instanceId),
            eq(systemRestartTargets.status, target.status),
          ),
        );
      await transaction
        .update(systemRestartOperations)
        .set({
          completedAt: input.now,
          errorCode,
          status: "timed_out",
          updatedAt: input.now,
        })
        .where(eq(systemRestartOperations.id, operation.id));
      expired += 1;
    }

    return expired;
  });
}
