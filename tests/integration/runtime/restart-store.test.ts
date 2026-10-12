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
});
