import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import {
  aiAuditPayloads,
  aiConversations,
  aiMessages,
  aiModels,
  aiProviderCredentials,
  aiQuotaAccounts,
  aiRuns,
  aiUsageLedger,
  db,
  resumes,
} from "@/db";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { deleteExpiredAiAuditEvidence } from "@/lib/ai/audit/retention";
import { runAiMaintenance } from "@/lib/ai/maintenance";
import { recoverExpiredAiRuns } from "@/lib/ai/runs/recovery";
import { reserveAiQuota } from "@/lib/ai/usage/ledger";
import { getDatabasePool } from "@/lib/runtime/database";

describe("AI maintenance recovery", () => {
  const marker = randomUUID();
  const userIds = [`ai-recovery-safe-${marker}`, `ai-recovery-uncertain-${marker}`];
  const resumeIds = [`resume-safe-${marker}`, `resume-uncertain-${marker}`];
  const conversationIds = [randomUUID(), randomUUID()];
  const messageIds = [randomUUID(), randomUUID()];
  const runIds = [randomUUID(), randomUUID()];
  let providerId = "";
  let modelId = "";
  const now = new Date("2026-09-16T12:00:00.000Z");

  beforeAll(async () => {
    const [provider] = await db.insert(aiProviderCredentials).values({
      kind: "platform",
      displayName: `Recovery ${marker}`,
      baseUrl: "https://models.example.com/v1",
      encryptedApiKey: Buffer.from("test-key"),
    }).returning({ id: aiProviderCredentials.id });
    providerId = provider!.id;
    const [model] = await db.insert(aiModels).values({
      providerId,
      providerModelKey: `recovery-${marker}`,
      displayName: "Recovery model",
      contextWindow: 8_192,
      maxOutputTokens: 1_024,
      inputPointRate: 1,
      cachedInputPointRate: 1,
      outputPointRate: 1,
    }).returning({ id: aiModels.id });
    modelId = model!.id;

    for (const [index, userId] of userIds.entries()) {
      await db.insert(resumes).values({
        id: resumeIds[index]!,
        userId,
        name: `Recovery resume ${index}`,
        summary: "Recovery",
        document: createDefaultResumeDocument(),
      });
      await db.insert(aiConversations).values({
        id: conversationIds[index],
        userId,
        resumeId: resumeIds[index]!,
        title: "Recovery conversation",
        contextScope: "resume",
        modelId,
      });
      await db.insert(aiMessages).values({
        id: messageIds[index],
        conversationId: conversationIds[index],
        role: "assistant",
        sequence: 1,
        completionState: "streaming",
      });
      await db.insert(aiRuns).values({
        id: runIds[index],
        userId,
        resumeId: resumeIds[index]!,
        conversationId: conversationIds[index],
        assistantMessageId: messageIds[index],
        modelId,
        keySource: "platform",
        status: index === 0 ? "preparing" : "streaming",
        resumeVersion: 1,
        contextHash: `hash-${index}`,
        promptVersion: 1,
        reservedPoints: 40,
        encryptedExecutionPayload: Buffer.from(`payload-${index}`),
        executionPayloadKeyVersion: 1,
        startedAt: index === 0 ? null : new Date("2026-09-16T11:00:00.000Z"),
        leaseExpiresAt: new Date("2026-09-16T11:30:00.000Z"),
      });
      await reserveAiQuota({
        userId,
        runId: runIds[index]!,
        operationId: runIds[index],
        points: 40,
        monthlyLimit: 100,
        modelId,
        rateCardVersion: 1,
        now: new Date("2026-09-16T10:00:00.000Z"),
      });
    }
  });

  afterAll(async () => {
    await db.delete(aiAuditPayloads).where(inArray(aiAuditPayloads.runId, runIds));
    await db.delete(aiUsageLedger).where(inArray(aiUsageLedger.userId, userIds));
    await db.delete(aiQuotaAccounts).where(inArray(aiQuotaAccounts.userId, userIds));
    await db.delete(aiRuns).where(inArray(aiRuns.id, runIds));
    await db.delete(aiMessages).where(inArray(aiMessages.id, messageIds));
    await db.delete(aiConversations).where(inArray(aiConversations.id, conversationIds));
    await db.delete(resumes).where(inArray(resumes.userId, userIds));
    await db.delete(aiModels).where(eq(aiModels.id, modelId));
    await db.delete(aiProviderCredentials).where(eq(aiProviderCredentials.id, providerId));
  });

  it("releases only provably unused leases and leaves uncertain usage for settlement", async () => {
    expect(await recoverExpiredAiRuns({ now, batchSize: 10 })).toEqual({
      interrupted: 1,
      settlementPending: 1,
      releasedPoints: 40,
    });
    expect(await recoverExpiredAiRuns({ now, batchSize: 10 })).toEqual({
      interrupted: 0,
      settlementPending: 0,
      releasedPoints: 0,
    });

    const runs = await db.select({
      id: aiRuns.id,
      status: aiRuns.status,
      encryptedExecutionPayload: aiRuns.encryptedExecutionPayload,
      executionPayloadKeyVersion: aiRuns.executionPayloadKeyVersion,
    })
      .from(aiRuns).where(inArray(aiRuns.id, runIds));
    expect(new Map(runs.map((run) => [run.id, run.status]))).toEqual(new Map([
      [runIds[0], "interrupted"],
      [runIds[1], "settlement_pending"],
    ]));
    expect(
      runs.every(
        (run) =>
          run.encryptedExecutionPayload === null &&
          run.executionPayloadKeyVersion === null,
      ),
    ).toBe(true);

    const quotas = await db.select().from(aiQuotaAccounts)
      .where(inArray(aiQuotaAccounts.userId, userIds));
    expect(quotas.find((quota) => quota.userId === userIds[0])?.reservedPoints).toBe(0);
    expect(quotas.find((quota) => quota.userId === userIds[1])?.reservedPoints).toBe(40);
  });

  it("leaves quota renewal to the usage path", async () => {
    await db.update(aiQuotaAccounts).set({
      periodStartedAt: new Date("2026-07-01T00:00:00.000Z"),
      periodEndsAt: new Date("2026-08-01T00:00:00.000Z"),
      usedPoints: 25,
    }).where(eq(aiQuotaAccounts.userId, userIds[0]));

    await runAiMaintenance({ now, batchSize: 10 });
    const [quota] = await db.select().from(aiQuotaAccounts)
      .where(eq(aiQuotaAccounts.userId, userIds[0]));
    expect(quota).toMatchObject({ usedPoints: 25, reservedPoints: 0 });
  });

  it("deletes expired evidence in bounded idempotent batches", async () => {
    await db.insert(aiAuditPayloads).values({
      runId: runIds[0],
      encryptedRequest: Buffer.from("request"),
      encryptedResponse: Buffer.from("response"),
      payloadHash: "expired",
      expiresAt: new Date("2026-09-16T11:00:00.000Z"),
    });
    expect(await deleteExpiredAiAuditEvidence({ now, batchSize: 1 })).toBe(1);
    expect(await deleteExpiredAiAuditEvidence({ now, batchSize: 1 })).toBe(0);
    expect(await db.select().from(aiAuditPayloads)
      .where(and(eq(aiAuditPayloads.runId, runIds[0]), eq(aiAuditPayloads.payloadHash, "expired"))))
      .toEqual([]);
  });

  it("skips safely while another maintenance process holds the advisory lock", async () => {
    const client = await getDatabasePool().connect();
    try {
      await client.query(
        "SELECT pg_advisory_lock(hashtext('anonresume:ai-recovery'))",
      );
      await expect(runAiMaintenance({ now, batchSize: 10 })).resolves.toEqual({
        recovery: { acquired: false },
        retention: { acquired: true, deletedEvidence: 0 },
      });
    } finally {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext('anonresume:ai-recovery'))",
      );
      client.release();
    }
  });
});
