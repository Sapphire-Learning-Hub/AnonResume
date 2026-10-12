import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  db,
  systemConfigRevisions,
  systemConfigRuntimeStates,
  systemRestartOperations,
  systemRestartTargets,
} from "@/db";
import {
  createSystemRestartOperation,
  getCurrentSystemRestartOperation,
} from "@/lib/admin/system-restart/service";
import {
  claimNextSystemRestartTarget,
  expireSystemRestartTargets,
  markSystemRestartTargetAwaitingStartup,
  markSystemRestartTargetExiting,
  reconcileSystemRestartTargetStartup,
} from "@/lib/runtime/restart/store";

describe("managed runtime restart operation creation", () => {
  const deploymentId = `restart-${randomUUID()}`;
  const now = new Date("2026-10-13T08:00:00.000Z");
  let activeRevisionId: string;

  beforeEach(async () => {
    await db.delete(systemRestartTargets);
    await db.delete(systemRestartOperations);
    await db.delete(systemConfigRuntimeStates);
    await db.delete(systemConfigRevisions);

    const [revision] = await db
      .insert(systemConfigRevisions)
      .values({
        createdByUserId: "restart-test",
        publishedAt: now,
        publishedByUserId: "restart-test",
        status: "active",
        version: 1,
      })
      .returning({ id: systemConfigRevisions.id });
    activeRevisionId = revision!.id;
  });

  afterAll(async () => {
    await db.delete(systemRestartTargets);
    await db.delete(systemRestartOperations);
    await db.delete(systemConfigRuntimeStates);
    await db.delete(systemConfigRevisions);
  });

  async function insertRuntime(input: {
    consumer: "web" | "pdf-worker" | "ai-worker";
    deployment?: string;
    healthState?: "healthy" | "restart_required" | "degraded";
    instance?: string;
    lastSeenAt?: Date;
    metadata?: Record<string, unknown>;
    sessionId?: string;
  }) {
    const instance = input.instance ?? randomUUID();
    const sessionId = input.sessionId ?? randomUUID();

    await db.insert(systemConfigRuntimeStates).values({
      consumer: input.consumer,
      desiredRevisionId: activeRevisionId,
      healthState: input.healthState ?? "restart_required",
      instanceId: `${input.deployment ?? deploymentId}/${input.consumer}/${instance}`,
      sessionId,
      lastSeenAt: input.lastSeenAt ?? now,
      loadedHotRevisionId: activeRevisionId,
      loadedRestartRevisionId: null,
      metadata: input.metadata ?? {
        configurationPollIntervalMs: 30_000,
        onlineRestartSupported: true,
        supervisorKind: "docker-compose",
      },
      release: "test",
      startedAt: new Date(now.getTime() - 60_000),
    });

    return { instanceId: `${input.deployment ?? deploymentId}/${input.consumer}/${instance}`, sessionId };
  }

  it("snapshots current targets with workers before web", async () => {
    const web = await insertRuntime({ consumer: "web", instance: "web-b" });
    const ai = await insertRuntime({ consumer: "ai-worker", instance: "ai-a" });
    const pdf = await insertRuntime({ consumer: "pdf-worker", instance: "pdf-a" });
    await insertRuntime({
      consumer: "web",
      deployment: "another-deployment",
      instance: "web-a",
    });
    await insertRuntime({
      consumer: "web",
      healthState: "healthy",
      instance: "web-current",
    });

    const operation = await createSystemRestartOperation({
      actorUserId: "restart-operator",
      deploymentId,
      idempotencyKey: randomUUID(),
      now,
    });

    expect(operation).toMatchObject({
      deploymentId,
      desiredRevisionId: activeRevisionId,
      status: "queued",
    });
    expect(operation.targets).toEqual([
      expect.objectContaining({
        consumer: "pdf-worker",
        expectedSessionId: pdf.sessionId,
        instanceId: pdf.instanceId,
        sequence: 0,
      }),
      expect.objectContaining({
        consumer: "ai-worker",
        expectedSessionId: ai.sessionId,
        instanceId: ai.instanceId,
        sequence: 1,
      }),
      expect.objectContaining({
        consumer: "web",
        expectedSessionId: web.sessionId,
        instanceId: web.instanceId,
        sequence: 2,
      }),
    ]);

    await expect(
      getCurrentSystemRestartOperation({ deploymentId }),
    ).resolves.toEqual(operation);
  });

  it("rejects a stale pending runtime", async () => {
    await insertRuntime({
      consumer: "web",
      lastSeenAt: new Date(now.getTime() - 3_001),
      metadata: {
        configurationPollIntervalMs: 1_000,
        onlineRestartSupported: true,
        supervisorKind: "systemd",
      },
    });

    await expect(
      createSystemRestartOperation({
        actorUserId: "restart-operator",
        deploymentId,
        idempotencyKey: randomUUID(),
        now,
      }),
    ).rejects.toMatchObject({ code: "runtime_stale" });
  });

  it("rejects a deployment with an unhealthy running runtime", async () => {
    await insertRuntime({ consumer: "web" });
    await insertRuntime({ consumer: "ai-worker", healthState: "degraded" });

    await expect(
      createSystemRestartOperation({
        actorUserId: "restart-operator",
        deploymentId,
        idempotencyKey: randomUUID(),
        now,
      }),
    ).rejects.toMatchObject({
      code: "runtime_unhealthy",
    });
  });

  it("rejects a target whose supervisor cannot relaunch it", async () => {
    await insertRuntime({
      consumer: "web",
      metadata: {
        configurationPollIntervalMs: 30_000,
        onlineRestartSupported: false,
        supervisorKind: "container",
      },
    });

    await expect(
      createSystemRestartOperation({
        actorUserId: "restart-operator",
        deploymentId,
        idempotencyKey: randomUUID(),
        now,
      }),
    ).rejects.toMatchObject({
      code: "restart_unsupported",
    });
  });

  it("allows only one active operation for a deployment", async () => {
    await insertRuntime({ consumer: "web" });
    await createSystemRestartOperation({
      actorUserId: "restart-operator-a",
      deploymentId,
      idempotencyKey: randomUUID(),
      now,
    });

    await expect(
      createSystemRestartOperation({
        actorUserId: "restart-operator-b",
        deploymentId,
        idempotencyKey: randomUUID(),
        now,
      }),
    ).rejects.toMatchObject({
      code: "operation_active",
    });
  });

  it("replays the original operation for the same actor and idempotency key", async () => {
    await insertRuntime({ consumer: "web" });
    const idempotencyKey = randomUUID();
    const first = await createSystemRestartOperation({
      actorUserId: "restart-operator",
      deploymentId,
      idempotencyKey,
      now,
    });
    const replay = await createSystemRestartOperation({
      actorUserId: "restart-operator",
      deploymentId,
      idempotencyKey,
      now: new Date(now.getTime() + 1_000),
    });

    expect(replay).toEqual(first);
    await expect(
      db
        .select({ id: systemRestartOperations.id })
        .from(systemRestartOperations)
        .where(eq(systemRestartOperations.deploymentId, deploymentId)),
    ).resolves.toHaveLength(1);
  });

  it("claims targets sequentially and guards stable identity and session", async () => {
    const pdf = await insertRuntime({ consumer: "pdf-worker", instance: "pdf-a" });
    const ai = await insertRuntime({ consumer: "ai-worker", instance: "ai-a" });
    await insertRuntime({ consumer: "web", instance: "web-a" });
    const operation = await createSystemRestartOperation({
      actorUserId: "restart-operator",
      deploymentId,
      idempotencyKey: randomUUID(),
      now,
    });

    await expect(
      claimNextSystemRestartTarget({
        consumer: "pdf-worker",
        deploymentId,
        now,
        sessionId: pdf.sessionId,
        stableId: `${deploymentId}/pdf-worker/wrong-instance`,
      }),
    ).resolves.toBeNull();
    await expect(
      claimNextSystemRestartTarget({
        consumer: "pdf-worker",
        deploymentId,
        now,
        sessionId: "replacement-session",
        stableId: pdf.instanceId,
      }),
    ).resolves.toBeNull();

    const claimedPdf = await claimNextSystemRestartTarget({
      consumer: "pdf-worker",
      deploymentId,
      now,
      sessionId: pdf.sessionId,
      stableId: pdf.instanceId,
    });
    expect(claimedPdf).toMatchObject({
      instanceId: pdf.instanceId,
      operationId: operation.id,
    });
    await expect(
      claimNextSystemRestartTarget({
        consumer: "ai-worker",
        deploymentId,
        now,
        sessionId: ai.sessionId,
        stableId: ai.instanceId,
      }),
    ).resolves.toBeNull();

    await markSystemRestartTargetExiting({ ...claimedPdf!, now });
    await markSystemRestartTargetAwaitingStartup({ ...claimedPdf!, now });
    await reconcileSystemRestartTargetStartup({
      consumer: "pdf-worker",
      deploymentId,
      healthState: "healthy",
      loadedRestartRevisionId: activeRevisionId,
      now,
      sessionId: "pdf-replacement-session",
      stableId: pdf.instanceId,
    });

    await expect(
      claimNextSystemRestartTarget({
        consumer: "ai-worker",
        deploymentId,
        now,
        sessionId: ai.sessionId,
        stableId: ai.instanceId,
      }),
    ).resolves.toMatchObject({ instanceId: ai.instanceId });
  });

  it("accepts an external session replacement and completes the operation", async () => {
    const web = await insertRuntime({ consumer: "web", instance: "web-a" });
    await createSystemRestartOperation({
      actorUserId: "restart-operator",
      deploymentId,
      idempotencyKey: randomUUID(),
      now,
    });

    await reconcileSystemRestartTargetStartup({
      consumer: "web",
      deploymentId,
      healthState: "healthy",
      loadedRestartRevisionId: activeRevisionId,
      now,
      sessionId: `${web.sessionId}-replacement`,
      stableId: web.instanceId,
    });

    await expect(
      getCurrentSystemRestartOperation({ deploymentId }),
    ).resolves.toMatchObject({
      status: "succeeded",
      targets: [expect.objectContaining({ status: "healthy" })],
    });
  });

  it("fails the operation when a replacement loads the wrong revision", async () => {
    const web = await insertRuntime({ consumer: "web", instance: "web-a" });
    await createSystemRestartOperation({
      actorUserId: "restart-operator",
      deploymentId,
      idempotencyKey: randomUUID(),
      now,
    });

    await reconcileSystemRestartTargetStartup({
      consumer: "web",
      deploymentId,
      healthState: "healthy",
      loadedRestartRevisionId: randomUUID(),
      now,
      sessionId: `${web.sessionId}-replacement`,
      stableId: web.instanceId,
    });

    await expect(
      getCurrentSystemRestartOperation({ deploymentId }),
    ).resolves.toMatchObject({
      errorCode: "replacement_wrong_revision",
      status: "failed",
      targets: [
        expect.objectContaining({
          errorCode: "replacement_wrong_revision",
          status: "failed",
        }),
      ],
    });
  });

  it("times out a worker that does not finish draining", async () => {
    const worker = await insertRuntime({ consumer: "ai-worker", instance: "ai-a" });
    await createSystemRestartOperation({
      actorUserId: "restart-operator",
      deploymentId,
      idempotencyKey: randomUUID(),
      now,
    });
    await claimNextSystemRestartTarget({
      consumer: "ai-worker",
      deploymentId,
      now,
      sessionId: worker.sessionId,
      stableId: worker.instanceId,
    });

    await expireSystemRestartTargets({
      now: new Date(now.getTime() + 600_001),
      startupTimeoutMs: 120_000,
      workerDrainTimeoutMs: 600_000,
    });

    await expect(
      getCurrentSystemRestartOperation({ deploymentId }),
    ).resolves.toMatchObject({
      errorCode: "worker_drain_timeout",
      status: "timed_out",
      targets: [expect.objectContaining({ status: "timed_out" })],
    });
  });

  it("times out a web target that does not return", async () => {
    const web = await insertRuntime({ consumer: "web", instance: "web-a" });
    await createSystemRestartOperation({
      actorUserId: "restart-operator",
      deploymentId,
      idempotencyKey: randomUUID(),
      now,
    });
    const claimed = await claimNextSystemRestartTarget({
      consumer: "web",
      deploymentId,
      now,
      sessionId: web.sessionId,
      stableId: web.instanceId,
    });
    await markSystemRestartTargetExiting({ ...claimed!, now });
    await markSystemRestartTargetAwaitingStartup({ ...claimed!, now });

    await expireSystemRestartTargets({
      now: new Date(now.getTime() + 120_001),
      startupTimeoutMs: 120_000,
      workerDrainTimeoutMs: 600_000,
    });

    await expect(
      getCurrentSystemRestartOperation({ deploymentId }),
    ).resolves.toMatchObject({
      errorCode: "instance_did_not_return",
      status: "timed_out",
      targets: [expect.objectContaining({ status: "timed_out" })],
    });
  });
});
