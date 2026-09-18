import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  aiQuotaAccounts,
  aiUsageLedger,
  db,
} from "@/db";
import {
  AiQuotaExceededError,
  getAiQuotaSnapshot,
  releaseAiQuota,
  reserveAiQuota,
  settleAiQuota,
} from "@/lib/ai/usage/ledger";

describe("AI usage ledger", () => {
  const userId = `ai-ledger-${randomUUID()}`;
  const overageUserId = `ai-ledger-overage-${randomUUID()}`;

  afterAll(async () => {
    for (const cleanupUserId of [userId, overageUserId]) {
      await db
        .delete(aiUsageLedger)
        .where(eq(aiUsageLedger.userId, cleanupUserId));
      await db
        .delete(aiQuotaAccounts)
        .where(eq(aiQuotaAccounts.userId, cleanupUserId));
    }
  });

  it("reserves, settles, and preserves an append-only net charge", async () => {
    const reservation = await reserveAiQuota({
      userId,
      runId: null,
      points: 80,
      monthlyLimit: 100,
      modelId: null,
      rateCardVersion: 1,
      now: new Date("2026-09-16T00:00:00.000Z"),
    });
    expect(reservation).toMatchObject({ availablePoints: 20, reservedPoints: 80 });

    const duplicate = await reserveAiQuota({
      userId,
      runId: null,
      operationId: reservation.operationId,
      points: 80,
      monthlyLimit: 100,
      modelId: null,
      rateCardVersion: 1,
      now: new Date("2026-09-16T00:00:01.000Z"),
    });
    expect(duplicate).toEqual(reservation);

    await settleAiQuota({
      userId,
      runId: null,
      operationId: reservation.operationId,
      actualPoints: 55,
      inputTokens: 20,
      cachedInputTokens: 5,
      outputTokens: 9,
    });
    await settleAiQuota({
      userId,
      runId: null,
      operationId: reservation.operationId,
      actualPoints: 55,
      inputTokens: 20,
      cachedInputTokens: 5,
      outputTokens: 9,
    });

    expect(await getAiQuotaSnapshot(userId)).toMatchObject({
      monthlyLimit: 100,
      usedPoints: 55,
      reservedPoints: 0,
      availablePoints: 45,
    });
    const entries = await db
      .select()
      .from(aiUsageLedger)
      .where(eq(aiUsageLedger.userId, userId));
    expect(entries.map((entry) => entry.entryType)).toEqual([
      "reserve",
      "settlement",
    ]);
    expect(entries.reduce((sum, entry) => sum + entry.pointsDelta, 0)).toBe(55);
  });

  it("rejects reservations beyond the remaining monthly quota", async () => {
    await expect(
      reserveAiQuota({
        userId,
        runId: null,
        points: 46,
        monthlyLimit: 100,
        modelId: null,
        rateCardVersion: 1,
        now: new Date("2026-09-16T00:01:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(AiQuotaExceededError);
  });

  it("settles above the estimate when the account still has available quota", async () => {
    const reservation = await reserveAiQuota({
      userId: overageUserId,
      runId: null,
      points: 20,
      monthlyLimit: 100,
      modelId: null,
      rateCardVersion: 1,
      now: new Date("2026-09-16T00:01:00.000Z"),
    });

    await settleAiQuota({
      userId: overageUserId,
      runId: null,
      operationId: reservation.operationId,
      actualPoints: 35,
      inputTokens: 300_000,
      cachedInputTokens: 100_000,
      outputTokens: 50_000,
    });

    expect(await getAiQuotaSnapshot(overageUserId)).toMatchObject({
      monthlyLimit: 100,
      usedPoints: 35,
      reservedPoints: 0,
      availablePoints: 65,
    });
  });

  it("releases an unused reservation once", async () => {
    const reservation = await reserveAiQuota({
      userId,
      runId: null,
      points: 30,
      monthlyLimit: 100,
      modelId: null,
      rateCardVersion: 1,
      now: new Date("2026-09-16T00:02:00.000Z"),
    });
    await releaseAiQuota({
      userId,
      runId: null,
      operationId: reservation.operationId,
    });
    await releaseAiQuota({
      userId,
      runId: null,
      operationId: reservation.operationId,
    });

    const releaseEntries = await db
      .select()
      .from(aiUsageLedger)
      .where(
        and(
          eq(aiUsageLedger.userId, userId),
          eq(aiUsageLedger.entryType, "release"),
        ),
      );
    expect(releaseEntries).toHaveLength(1);
    expect((await getAiQuotaSnapshot(userId))?.reservedPoints).toBe(0);
  });
});
