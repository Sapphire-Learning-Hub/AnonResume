import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

interface QuotaAccountRow {
  monthlyLimit: string;
  periodStartedAt: Date;
  periodEndsAt: Date;
  usedPoints: string;
  reservedPoints: string;
}

interface LedgerRow {
  pointsDelta: string;
  metadata: Record<string, unknown>;
}

export interface AiQuotaSnapshot {
  monthlyLimit: number;
  periodStartedAt: Date;
  periodEndsAt: Date;
  usedPoints: number;
  reservedPoints: number;
  availablePoints: number;
}

export class AiQuotaExceededError extends Error {
  constructor() {
    super("ai_quota_exceeded");
    this.name = "AiQuotaExceededError";
  }
}

export class AiSettlementExceedsReservationError extends Error {
  constructor() {
    super("ai_settlement_exceeds_reservation");
    this.name = "AiSettlementExceedsReservationError";
  }
}

export interface AiQuotaSettlementInput {
  userId: string;
  runId: string | null;
  operationId: string;
  actualPoints: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function table(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

function nextMonthlyPeriod(now: Date) {
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

function snapshot(row: QuotaAccountRow): AiQuotaSnapshot {
  const monthlyLimit = Number(row.monthlyLimit);
  const usedPoints = Number(row.usedPoints);
  const reservedPoints = Number(row.reservedPoints);
  return {
    monthlyLimit,
    periodStartedAt: row.periodStartedAt,
    periodEndsAt: row.periodEndsAt,
    usedPoints,
    reservedPoints,
    availablePoints: Math.max(0, monthlyLimit - usedPoints - reservedPoints),
  };
}

async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function lockQuotaAccount(
  client: PoolClient,
  input: { userId: string; monthlyLimit: number; now: Date },
) {
  const periodEndsAt = nextMonthlyPeriod(input.now);
  await client.query(
    `INSERT INTO ${table("ai_quota_accounts")}
       (user_id, monthly_limit, period_started_at, period_ends_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO NOTHING`,
    [input.userId, input.monthlyLimit, input.now, periodEndsAt],
  );

  const result = await client.query<QuotaAccountRow>(
    `SELECT monthly_limit AS "monthlyLimit",
            period_started_at AS "periodStartedAt",
            period_ends_at AS "periodEndsAt",
            used_points AS "usedPoints",
            reserved_points AS "reservedPoints"
       FROM ${table("ai_quota_accounts")}
      WHERE user_id = $1
      FOR UPDATE`,
    [input.userId],
  );
  let row = result.rows[0]!;

  if (row.periodEndsAt <= input.now && Number(row.reservedPoints) === 0) {
    const renewed = await client.query<QuotaAccountRow>(
      `UPDATE ${table("ai_quota_accounts")}
          SET period_started_at = $2,
              period_ends_at = $3,
              used_points = 0,
              updated_at = now()
        WHERE user_id = $1
        RETURNING monthly_limit AS "monthlyLimit",
                  period_started_at AS "periodStartedAt",
                  period_ends_at AS "periodEndsAt",
                  used_points AS "usedPoints",
                  reserved_points AS "reservedPoints"`,
      [input.userId, input.now, periodEndsAt],
    );
    row = renewed.rows[0]!;
    await client.query(
      `INSERT INTO ${table("ai_usage_ledger")}
         (user_id, entry_type, points_delta, metadata)
       VALUES ($1, 'renewal', 0, $2::jsonb)`,
      [input.userId, JSON.stringify({ periodStartedAt: input.now })],
    );
  }

  return row;
}

async function findOperationEntry(
  client: PoolClient,
  userId: string,
  operationId: string,
  entryType: "reserve" | "settlement" | "release",
) {
  const result = await client.query<LedgerRow>(
    `SELECT points_delta AS "pointsDelta", metadata
       FROM ${table("ai_usage_ledger")}
      WHERE user_id = $1
        AND entry_type = $2
        AND metadata ->> 'operationId' = $3
      LIMIT 1`,
    [userId, entryType, operationId],
  );
  return result.rows[0];
}

export async function reserveAiQuota(input: {
  userId: string;
  runId: string | null;
  operationId?: string;
  points: number;
  monthlyLimit: number;
  modelId: string | null;
  rateCardVersion: number;
  now?: Date;
}) {
  const operationId = input.operationId ?? randomUUID();
  const now = input.now ?? new Date();

  return withTransaction(async (client) => {
    const account = await lockQuotaAccount(client, {
      userId: input.userId,
      monthlyLimit: input.monthlyLimit,
      now,
    });
    const existing = await findOperationEntry(
      client,
      input.userId,
      operationId,
      "reserve",
    );
    if (existing) {
      const current = snapshot(account);
      return {
        operationId,
        reservedPoints: Number(existing.pointsDelta),
        availablePoints: current.availablePoints,
      };
    }

    if (!Number.isSafeInteger(input.points) || input.points < 0) {
      throw new Error("invalid_ai_reservation");
    }
    const current = snapshot(account);
    if (input.points > current.availablePoints) {
      throw new AiQuotaExceededError();
    }

    await client.query(
      `UPDATE ${table("ai_quota_accounts")}
          SET reserved_points = reserved_points + $2,
              updated_at = now()
        WHERE user_id = $1`,
      [input.userId, input.points],
    );
    await client.query(
      `INSERT INTO ${table("ai_usage_ledger")}
         (user_id, run_id, entry_type, points_delta, model_id,
          rate_card_version, metadata)
       VALUES ($1, $2, 'reserve', $3, $4, $5, $6::jsonb)`,
      [
        input.userId,
        input.runId,
        input.points,
        input.modelId,
        input.rateCardVersion,
        JSON.stringify({ operationId }),
      ],
    );

    return {
      operationId,
      reservedPoints: input.points,
      availablePoints: current.availablePoints - input.points,
    };
  });
}

export async function settleAiQuotaInTransaction(
  client: PoolClient,
  input: AiQuotaSettlementInput,
) {
    const accountResult = await client.query<QuotaAccountRow>(
      `SELECT monthly_limit AS "monthlyLimit",
              period_started_at AS "periodStartedAt",
              period_ends_at AS "periodEndsAt",
              used_points AS "usedPoints",
              reserved_points AS "reservedPoints"
         FROM ${table("ai_quota_accounts")}
        WHERE user_id = $1
        FOR UPDATE`,
      [input.userId],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error("ai_quota_account_not_found");

    if (
      await findOperationEntry(
        client,
        input.userId,
        input.operationId,
        "settlement",
      )
    ) {
      return snapshot(account);
    }
    const reservation = await findOperationEntry(
      client,
      input.userId,
      input.operationId,
      "reserve",
    );
    if (!reservation) throw new Error("ai_reservation_not_found");
    const reservedPoints = Number(reservation.pointsDelta);
    if (!Number.isSafeInteger(input.actualPoints) || input.actualPoints < 0) {
      throw new AiSettlementExceedsReservationError();
    }
    const current = snapshot(account);
    const additionalPoints = Math.max(
      0,
      input.actualPoints - reservedPoints,
    );
    if (additionalPoints > current.availablePoints) {
      throw new AiSettlementExceedsReservationError();
    }

    const updated = await client.query<QuotaAccountRow>(
      `UPDATE ${table("ai_quota_accounts")}
          SET reserved_points = reserved_points - $2,
              used_points = used_points + $3,
              updated_at = now()
        WHERE user_id = $1
        RETURNING monthly_limit AS "monthlyLimit",
                  period_started_at AS "periodStartedAt",
                  period_ends_at AS "periodEndsAt",
                  used_points AS "usedPoints",
                  reserved_points AS "reservedPoints"`,
      [input.userId, reservedPoints, input.actualPoints],
    );
    await client.query(
      `INSERT INTO ${table("ai_usage_ledger")}
         (user_id, run_id, entry_type, points_delta, input_tokens,
          cached_input_tokens, output_tokens, metadata)
       VALUES ($1, $2, 'settlement', $3, $4, $5, $6, $7::jsonb)`,
      [
        input.userId,
        input.runId,
        input.actualPoints - reservedPoints,
        input.inputTokens,
        input.cachedInputTokens,
        input.outputTokens,
        JSON.stringify({
          operationId: input.operationId,
          actualPoints: input.actualPoints,
          reservedPoints,
          additionalPoints,
        }),
      ],
    );
    return snapshot(updated.rows[0]!);
}

export async function settleAiQuota(input: AiQuotaSettlementInput) {
  return withTransaction(async (client) => {
    return settleAiQuotaInTransaction(client, input);
  });
}

export async function releaseAiQuota(input: {
  userId: string;
  runId: string | null;
  operationId: string;
}) {
  return withTransaction(async (client) => {
    const accountResult = await client.query<QuotaAccountRow>(
      `SELECT monthly_limit AS "monthlyLimit",
              period_started_at AS "periodStartedAt",
              period_ends_at AS "periodEndsAt",
              used_points AS "usedPoints",
              reserved_points AS "reservedPoints"
         FROM ${table("ai_quota_accounts")}
        WHERE user_id = $1
        FOR UPDATE`,
      [input.userId],
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error("ai_quota_account_not_found");
    if (
      await findOperationEntry(
        client,
        input.userId,
        input.operationId,
        "release",
      )
    ) {
      return snapshot(account);
    }
    const reservation = await findOperationEntry(
      client,
      input.userId,
      input.operationId,
      "reserve",
    );
    if (!reservation) throw new Error("ai_reservation_not_found");
    const reservedPoints = Number(reservation.pointsDelta);

    const updated = await client.query<QuotaAccountRow>(
      `UPDATE ${table("ai_quota_accounts")}
          SET reserved_points = reserved_points - $2,
              updated_at = now()
        WHERE user_id = $1
        RETURNING monthly_limit AS "monthlyLimit",
                  period_started_at AS "periodStartedAt",
                  period_ends_at AS "periodEndsAt",
                  used_points AS "usedPoints",
                  reserved_points AS "reservedPoints"`,
      [input.userId, reservedPoints],
    );
    await client.query(
      `INSERT INTO ${table("ai_usage_ledger")}
         (user_id, run_id, entry_type, points_delta, metadata)
       VALUES ($1, $2, 'release', $3, $4::jsonb)`,
      [
        input.userId,
        input.runId,
        -reservedPoints,
        JSON.stringify({ operationId: input.operationId }),
      ],
    );
    return snapshot(updated.rows[0]!);
  });
}

export async function getAiQuotaSnapshot(userId: string) {
  const result = await getDatabasePool().query<QuotaAccountRow>(
    `SELECT monthly_limit AS "monthlyLimit",
            period_started_at AS "periodStartedAt",
            period_ends_at AS "periodEndsAt",
            used_points AS "usedPoints",
            reserved_points AS "reservedPoints"
       FROM ${table("ai_quota_accounts")}
      WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ? snapshot(result.rows[0]) : null;
}
