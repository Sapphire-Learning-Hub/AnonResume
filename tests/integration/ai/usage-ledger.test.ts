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

  afterAll(async () => {
    await db.delete(aiUsageLedger).where(eq(aiUsageLedger.userId, userId));
    await db.delete(aiQuotaAccounts).where(eq(aiQuotaAccounts.userId, userId));
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
