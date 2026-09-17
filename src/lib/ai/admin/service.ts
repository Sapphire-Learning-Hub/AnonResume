import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PoolClient, QueryResultRow } from "pg";

import {
  aiAuditPayloads,
  aiModels,
  aiProviderCredentials,
  aiRuns,
  db,
  getDatabaseSchemaName,
} from "@/db";
import { writeAdminAuditEvent, writeAdminAuditEventWithClient } from "@/lib/admin/audit";
import { decryptAiAuditEvidence } from "@/lib/ai/audit/store";
import {
  decryptAiCredential,
  encryptAiCredential,
} from "@/lib/ai/security/credentials";
import { assertSafeAiEndpoint } from "@/lib/ai/security/endpoint-policy";
import { releaseAiQuota, settleAiQuota } from "@/lib/ai/usage/ledger";
import { getDatabasePool } from "@/lib/runtime/database";
import {
  createPageResult,
  resolvePage,
  type PageRequest,
  type PageResult,
} from "@/lib/shared/pagination";

export class AiAdminNotFoundError extends Error {
  constructor() {
    super("ai_admin_resource_not_found");
    this.name = "AiAdminNotFoundError";
  }
}

export class AiAdminStateConflictError extends Error {
  constructor() {
    super("ai_admin_state_conflict");
    this.name = "AiAdminStateConflictError";
  }
}

export interface AiAdminListRequest extends PageRequest {
  query?: string;
}

export interface AiAdminProviderInput {
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
}

export interface AiAdminModelInput {
  providerModelKey: string;
  displayName: string;
  enabled: boolean;
  supportsToolCalls: boolean;
  freeModel: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  inputPointRate: number;
  cachedInputPointRate: number;
  outputPointRate: number;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function schemaName() {
  return quoteIdentifier(getDatabaseSchemaName());
}

function searchPattern(query?: string) {
  const normalized = query?.trim().slice(0, 100);
  return normalized ? `%${normalized}%` : null;
}

async function runPagedQuery<T extends QueryResultRow>(
  request: PageRequest,
  countSql: string,
  dataSql: string,
  countValues: unknown[] = [],
  dataValues: unknown[] = countValues,
): Promise<PageResult<T>> {
  const pool = getDatabasePool();
  const count = await pool.query<{ total: string }>(countSql, countValues);
  const total = Number(count.rows[0]?.total ?? 0);
  const resolved = resolvePage(total, request);
  const rows = await pool.query<T>(dataSql, [
    ...dataValues,
    request.pageSize,
    resolved.offset,
  ]);
  return createPageResult(rows.rows, total, request);
}

export async function listAiAdminProviders(request: AiAdminListRequest) {
  const schema = schemaName();
  const query = searchPattern(request.query);
  const where = [
    "provider.kind = 'platform'",
    "provider.deleted_at IS NULL",
    query
      ? `(provider.display_name ILIKE $1 OR provider.base_url ILIKE $1 OR EXISTS (
          SELECT 1 FROM ${schema}.ai_models AS searched_model
           WHERE searched_model.provider_id = provider.id
             AND searched_model.deleted_at IS NULL
             AND (searched_model.display_name ILIKE $1 OR searched_model.provider_model_key ILIKE $1)
        ))`
      : null,
  ].filter(Boolean).join(" AND ");
  const values = query ? [query] : [];
  const limit = values.length + 1;
  const offset = values.length + 2;

  const page = await runPagedQuery<{
    providerId: string;
    providerName: string;
    baseUrl: string;
    providerEnabled: boolean;
  }>(
    request,
    `SELECT count(*)::text AS total
       FROM ${schema}.ai_provider_credentials AS provider
       WHERE ${where}`,
    `SELECT provider.id::text AS "providerId", provider.display_name AS "providerName",
            provider.base_url AS "baseUrl", provider.enabled AS "providerEnabled"
       FROM ${schema}.ai_provider_credentials AS provider
       WHERE ${where}
      ORDER BY lower(provider.display_name), provider.id
      LIMIT $${limit} OFFSET $${offset}`,
    values,
  );

  const providerIds = page.items.map((provider) => provider.providerId);
  if (providerIds.length === 0) {
    return { ...page, items: [] };
  }
  const modelRows = await db
    .select({
      modelId: aiModels.id,
      providerId: aiModels.providerId,
      modelKey: aiModels.providerModelKey,
      modelName: aiModels.displayName,
      modelEnabled: aiModels.enabled,
      supportsToolCalls: aiModels.supportsToolCalls,
      contextWindow: aiModels.contextWindow,
      maxOutputTokens: aiModels.maxOutputTokens,
      inputPointRate: aiModels.inputPointRate,
      cachedInputPointRate: aiModels.cachedInputPointRate,
      outputPointRate: aiModels.outputPointRate,
      rateCardVersion: aiModels.rateCardVersion,
    })
    .from(aiModels)
    .where(and(
      inArray(aiModels.providerId, providerIds),
      isNull(aiModels.deletedAt),
    ))
    .orderBy(asc(aiModels.displayName), asc(aiModels.id));
  const modelsByProvider = new Map<string, typeof modelRows>();
  for (const model of modelRows) {
    const models = modelsByProvider.get(model.providerId) ?? [];
    models.push(model);
    modelsByProvider.set(model.providerId, models);
  }
  return {
    ...page,
    items: page.items.map((provider) => ({
      ...provider,
      models: (modelsByProvider.get(provider.providerId) ?? []).map((model) => ({
        ...model,
        inputPointRate: String(model.inputPointRate),
        cachedInputPointRate: String(model.cachedInputPointRate),
        outputPointRate: String(model.outputPointRate),
      })),
    })),
  };
}

export async function saveAiAdminProvider(input: {
  actorUserId: string;
  providerId?: string;
  encryptionKey: Buffer;
  trustedEndpointHostnames?: readonly string[];
  value: AiAdminProviderInput;
}) {
  const endpoint = await assertSafeAiEndpoint(
    input.value.baseUrl,
    undefined,
    new Set(input.trustedEndpointHostnames ?? []),
  );
  const existing = input.providerId
    ? await db
        .select({
          providerId: aiProviderCredentials.id,
        })
        .from(aiProviderCredentials)
        .where(
          and(
            eq(aiProviderCredentials.id, input.providerId),
            eq(aiProviderCredentials.kind, "platform"),
            isNull(aiProviderCredentials.deletedAt),
          ),
        )
        .limit(1)
    : [];
  if (input.providerId && !existing[0]) throw new AiAdminNotFoundError();
  if (!existing[0] && !input.value.apiKey) throw new Error("ai_api_key_required");

  const result = await db.transaction(async (transaction) => {
    let providerId = existing[0]?.providerId;
    if (providerId) {
      await transaction
        .update(aiProviderCredentials)
        .set({
          displayName: input.value.displayName,
          baseUrl: endpoint.href,
          enabled: input.value.enabled,
          encryptedApiKey: input.value.apiKey
            ? encryptAiCredential(input.value.apiKey, input.encryptionKey)
            : undefined,
          updatedAt: new Date(),
        })
        .where(eq(aiProviderCredentials.id, providerId));
      if (!input.value.enabled) {
        await transaction
          .update(aiModels)
          .set({ enabled: false, updatedAt: new Date() })
          .where(and(
            eq(aiModels.providerId, providerId),
            isNull(aiModels.deletedAt),
          ));
      }
    } else {
      const [provider] = await transaction
        .insert(aiProviderCredentials)
        .values({
          kind: "platform",
          displayName: input.value.displayName,
          baseUrl: endpoint.href,
          encryptedApiKey: encryptAiCredential(input.value.apiKey!, input.encryptionKey),
          enabled: input.value.enabled,
        })
        .returning({ id: aiProviderCredentials.id });
      providerId = provider!.id;
    }

    return { providerId };
  });

  await writeAdminAuditEvent({
    actorUserId: input.actorUserId,
    action: input.providerId ? "ai.provider.update" : "ai.provider.create",
    targetType: "ai_provider",
    targetId: result.providerId,
    outcome: "success",
    metadata: {
      providerName: input.value.displayName,
      enabled: input.value.enabled,
    },
  });
  return result;
}

async function requirePlatformProvider(providerId: string) {
  const [provider] = await db
    .select({
      id: aiProviderCredentials.id,
      enabled: aiProviderCredentials.enabled,
      name: aiProviderCredentials.displayName,
    })
    .from(aiProviderCredentials)
    .where(and(
      eq(aiProviderCredentials.id, providerId),
      eq(aiProviderCredentials.kind, "platform"),
      isNull(aiProviderCredentials.deletedAt),
    ))
    .limit(1);
  if (!provider) throw new AiAdminNotFoundError();
  return provider;
}

function adminModelValues(providerId: string, value: AiAdminModelInput) {
  return {
    providerId,
    providerModelKey: value.providerModelKey,
    displayName: value.displayName,
    enabled: value.enabled,
    supportsToolCalls: value.supportsToolCalls,
    contextWindow: value.contextWindow,
    maxOutputTokens: value.maxOutputTokens,
    inputPointRate: value.inputPointRate,
    cachedInputPointRate: value.cachedInputPointRate,
    outputPointRate: value.outputPointRate,
    updatedAt: new Date(),
  };
}

function adminModelResult(model: typeof aiModels.$inferSelect) {
  return {
    providerId: model.providerId,
    modelId: model.id,
    modelKey: model.providerModelKey,
    modelName: model.displayName,
    modelEnabled: model.enabled,
    supportsToolCalls: model.supportsToolCalls,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    inputPointRate: String(model.inputPointRate),
    cachedInputPointRate: String(model.cachedInputPointRate),
    outputPointRate: String(model.outputPointRate),
    rateCardVersion: model.rateCardVersion,
  };
}

export async function createAiAdminModel(input: {
  actorUserId: string;
  providerId: string;
  value: AiAdminModelInput;
}) {
  const provider = await requirePlatformProvider(input.providerId);
  if (input.value.enabled && !provider.enabled) {
    throw new AiAdminStateConflictError();
  }
  const [model] = await db
    .insert(aiModels)
    .values(adminModelValues(input.providerId, input.value))
    .returning();
  await writeAdminAuditEvent({
    actorUserId: input.actorUserId,
    action: "ai.model.create",
    targetType: "ai_model",
    targetId: model!.id,
    outcome: "success",
    metadata: {
      providerId: provider.id,
      providerName: provider.name,
      modelName: input.value.displayName,
      enabled: input.value.enabled,
    },
  });
  return adminModelResult(model!);
}

export async function updateAiAdminModel(input: {
  actorUserId: string;
  providerId: string;
  modelId: string;
  value: AiAdminModelInput;
}) {
  const provider = await requirePlatformProvider(input.providerId);
  if (input.value.enabled && !provider.enabled) {
    throw new AiAdminStateConflictError();
  }
  const [model] = await db
    .update(aiModels)
    .set({
      ...adminModelValues(input.providerId, input.value),
      rateCardVersion: sql`${aiModels.rateCardVersion} + 1`,
    })
    .where(and(
      eq(aiModels.id, input.modelId),
      eq(aiModels.providerId, input.providerId),
      isNull(aiModels.deletedAt),
    ))
    .returning();
  if (!model) throw new AiAdminNotFoundError();
  await writeAdminAuditEvent({
    actorUserId: input.actorUserId,
    action: "ai.model.update",
    targetType: "ai_model",
    targetId: model.id,
    outcome: "success",
    metadata: {
      providerId: provider.id,
      providerName: provider.name,
      modelName: input.value.displayName,
      enabled: input.value.enabled,
      rateCardVersion: model.rateCardVersion,
    },
  });
  return adminModelResult(model);
}

export async function disableAiAdminProvider(input: {
  actorUserId: string;
  providerId: string;
}) {
  const [provider] = await db
    .update(aiProviderCredentials)
    .set({ enabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(aiProviderCredentials.id, input.providerId),
        eq(aiProviderCredentials.kind, "platform"),
        isNull(aiProviderCredentials.deletedAt),
      ),
    )
    .returning({ id: aiProviderCredentials.id });
  if (!provider) throw new AiAdminNotFoundError();
  await db
    .update(aiModels)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(aiModels.providerId, provider.id));
  await writeAdminAuditEvent({
    actorUserId: input.actorUserId,
    action: "ai.provider.disable",
    targetType: "ai_provider",
    targetId: provider.id,
    outcome: "success",
  });
}

export async function deleteAiAdminModel(input: {
  actorUserId: string;
  providerId: string;
  modelId: string;
}) {
  return withTransaction(async (client) => {
    const current = await client.query<{
      modelEnabled: boolean;
      modelName: string;
      providerName: string;
    }>(
      `SELECT model.enabled AS "modelEnabled", model.display_name AS "modelName",
              provider.display_name AS "providerName"
         FROM ${schemaName()}.ai_models AS model
         JOIN ${schemaName()}.ai_provider_credentials AS provider
           ON provider.id = model.provider_id
        WHERE provider.id = $1 AND model.id = $2
          AND provider.kind = 'platform' AND model.deleted_at IS NULL
        FOR UPDATE OF model, provider`,
      [input.providerId, input.modelId],
    );
    const target = current.rows[0];
    if (!target) throw new AiAdminNotFoundError();
    if (target.modelEnabled) {
      throw new AiAdminStateConflictError();
    }

    await client.query(
      `UPDATE ${schemaName()}.ai_models
          SET deleted_at = now(), updated_at = now()
        WHERE id = $1 AND provider_id = $2 AND enabled = false
          AND deleted_at IS NULL`,
      [input.modelId, input.providerId],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId: input.actorUserId,
      action: "ai.model.delete",
      targetType: "ai_model",
      targetId: input.modelId,
      outcome: "success",
      metadata: {
        providerId: input.providerId,
        providerName: target.providerName,
        modelName: target.modelName,
      },
    });
  });
}

export async function listAiAdminQuotas(
  request: AiAdminListRequest,
  defaultMonthlyLimit: number,
) {
  const schema = schemaName();
  const query = searchPattern(request.query);
  const where = query ? "WHERE identity.name ILIKE $1 OR identity.email ILIKE $1" : "";
  const values = query ? [query] : [];
  const defaultParam = values.length + 1;
  const limit = values.length + 2;
  const offset = values.length + 3;
  return runPagedQuery<{
    userId: string;
    userName: string;
    email: string;
    monthlyLimit: string;
    customLimit: boolean;
    usedPoints: string;
    reservedPoints: string;
    periodStartedAt: Date | null;
    periodEndsAt: Date | null;
  }>(
    request,
    `SELECT count(*)::text AS total FROM "user" AS identity ${where}`,
    `SELECT identity.id AS "userId", identity.name AS "userName", identity.email,
            coalesce(quota.monthly_limit, $${defaultParam})::text AS "monthlyLimit",
            (quota.monthly_limit IS NOT NULL AND quota.monthly_limit <> $${defaultParam}) AS "customLimit",
            coalesce(quota.used_points, 0)::text AS "usedPoints",
            coalesce(quota.reserved_points, 0)::text AS "reservedPoints",
            quota.period_started_at AS "periodStartedAt",
            quota.period_ends_at AS "periodEndsAt"
       FROM "user" AS identity
       LEFT JOIN ${schema}.ai_quota_accounts AS quota ON quota.user_id = identity.id
       ${where}
      ORDER BY lower(identity.name), identity.id
      LIMIT $${limit} OFFSET $${offset}`,
    values,
    [...values, defaultMonthlyLimit],
  );
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

export async function updateAiAdminQuota(input: {
  actorUserId: string;
  userId: string;
  monthlyLimit: number;
  periodStartedAt: Date;
  periodEndsAt: Date;
}) {
  if (input.periodEndsAt <= input.periodStartedAt) {
    throw new Error("invalid_quota_period");
  }
  return withTransaction(async (client) => {
    const identity = await client.query<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM "user" WHERE id = $1`,
      [input.userId],
    );
    if (!identity.rows[0]) throw new AiAdminNotFoundError();
    const current = await client.query<{
      monthlyLimit: string;
      periodStartedAt: Date;
      periodEndsAt: Date;
    }>(
      `SELECT monthly_limit::text AS "monthlyLimit",
              period_started_at AS "periodStartedAt",
              period_ends_at AS "periodEndsAt"
         FROM ${schemaName()}.ai_quota_accounts WHERE user_id = $1 FOR UPDATE`,
      [input.userId],
    );
    const previousLimit = current.rows[0] ? Number(current.rows[0].monthlyLimit) : null;
    await client.query(
      `INSERT INTO ${schemaName()}.ai_quota_accounts
         (user_id, monthly_limit, period_started_at, period_ends_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET monthly_limit = EXCLUDED.monthly_limit,
             period_started_at = EXCLUDED.period_started_at,
             period_ends_at = EXCLUDED.period_ends_at,
             updated_at = now()`,
      [
        input.userId,
        input.monthlyLimit,
        input.periodStartedAt,
        input.periodEndsAt,
      ],
    );
    await client.query(
      `INSERT INTO ${schemaName()}.ai_usage_ledger
         (user_id, entry_type, points_delta, metadata)
       VALUES ($1, 'adjustment', 0, $2::jsonb)`,
      [
        input.userId,
        JSON.stringify({
          actorUserId: input.actorUserId,
          previousMonthlyLimit: previousLimit,
          monthlyLimit: input.monthlyLimit,
          previousPeriodStartedAt: current.rows[0]?.periodStartedAt ?? null,
          previousPeriodEndsAt: current.rows[0]?.periodEndsAt ?? null,
          periodStartedAt: input.periodStartedAt,
          periodEndsAt: input.periodEndsAt,
        }),
      ],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId: input.actorUserId,
      action: "ai.quota.update",
      targetType: "user",
      targetId: input.userId,
      outcome: "success",
      metadata: {
        previousMonthlyLimit: previousLimit,
        monthlyLimit: input.monthlyLimit,
        previousPeriodStartedAt: current.rows[0]?.periodStartedAt ?? null,
        previousPeriodEndsAt: current.rows[0]?.periodEndsAt ?? null,
        periodStartedAt: input.periodStartedAt,
        periodEndsAt: input.periodEndsAt,
        resources: [{
          type: "user",
          id: input.userId,
          label: identity.rows[0].name,
          description: identity.rows[0].email,
        }],
      },
    });
    return {
      userId: input.userId,
      monthlyLimit: input.monthlyLimit,
      periodStartedAt: input.periodStartedAt,
      periodEndsAt: input.periodEndsAt,
    };
  });
}

export async function listAiAdminUsage(
  request: AiAdminListRequest & { settlementPendingOnly?: boolean },
) {
  const schema = schemaName();
  const query = searchPattern(request.query);
  const clauses = [
    request.settlementPendingOnly ? "run.status = 'settlement_pending'" : null,
    query
      ? "(run.id::text ILIKE $1 OR identity.name ILIKE $1 OR identity.email ILIKE $1 OR model.display_name ILIKE $1 OR resume.name ILIKE $1)"
      : null,
  ].filter(Boolean);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const values = query ? [query] : [];
  const limit = values.length + 1;
  const offset = values.length + 2;
  return runPagedQuery<{
    runId: string;
    userId: string;
    userName: string;
    email: string;
    resumeId: string;
    resumeName: string;
    modelId: string;
    modelName: string;
    keySource: string;
    status: string;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    reservedPoints: string;
    finalPoints: string | null;
    hasEvidence: boolean;
    createdAt: Date;
    completedAt: Date | null;
  }>(
    request,
    `SELECT count(*)::text AS total
       FROM ${schema}.ai_runs AS run
       JOIN "user" AS identity ON identity.id = run.user_id
       JOIN ${schema}.resumes AS resume ON resume.id = run.resume_id AND resume.user_id = run.user_id
       JOIN ${schema}.ai_models AS model ON model.id = run.model_id
       ${where}`,
    `SELECT run.id::text AS "runId", run.user_id AS "userId",
            identity.name AS "userName", identity.email,
            run.resume_id AS "resumeId", resume.name AS "resumeName",
            model.id::text AS "modelId", model.display_name AS "modelName",
            run.key_source AS "keySource", run.status,
            run.input_tokens AS "inputTokens", run.cached_input_tokens AS "cachedInputTokens",
            run.output_tokens AS "outputTokens", run.reserved_points::text AS "reservedPoints",
            run.final_points::text AS "finalPoints",
            (evidence.run_id IS NOT NULL) AS "hasEvidence",
            run.created_at AS "createdAt", run.completed_at AS "completedAt"
       FROM ${schema}.ai_runs AS run
       JOIN "user" AS identity ON identity.id = run.user_id
       JOIN ${schema}.resumes AS resume ON resume.id = run.resume_id AND resume.user_id = run.user_id
       JOIN ${schema}.ai_models AS model ON model.id = run.model_id
       LEFT JOIN ${schema}.ai_audit_payloads AS evidence ON evidence.run_id = run.id
       ${where}
      ORDER BY run.created_at DESC, run.id DESC
      LIMIT $${limit} OFFSET $${offset}`,
    values,
  );
}

export async function listAiAdminLedger(request: AiAdminListRequest) {
  const schema = schemaName();
  const query = searchPattern(request.query);
  const where = query
    ? "WHERE ledger.id::text ILIKE $1 OR identity.name ILIKE $1 OR identity.email ILIKE $1 OR model.display_name ILIKE $1 OR coalesce(resume.name, '') ILIKE $1"
    : "";
  const values = query ? [query] : [];
  const limit = values.length + 1;
  const offset = values.length + 2;
  return runPagedQuery<{
    ledgerId: string;
    runId: string | null;
    userId: string;
    userName: string;
    email: string;
    resumeId: string | null;
    resumeName: string | null;
    modelId: string | null;
    modelName: string | null;
    entryType: string;
    pointsDelta: string;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    createdAt: Date;
  }>(
    request,
    `SELECT count(*)::text AS total
       FROM ${schema}.ai_usage_ledger AS ledger
       JOIN "user" AS identity ON identity.id = ledger.user_id
       LEFT JOIN ${schema}.ai_models AS model ON model.id = ledger.model_id
       LEFT JOIN ${schema}.ai_runs AS run ON run.id = ledger.run_id
       LEFT JOIN ${schema}.resumes AS resume ON resume.id = run.resume_id AND resume.user_id = run.user_id
       ${where}`,
    `SELECT ledger.id::text AS "ledgerId", ledger.run_id::text AS "runId",
            ledger.user_id AS "userId", identity.name AS "userName", identity.email,
            resume.id AS "resumeId", resume.name AS "resumeName",
            model.id::text AS "modelId", model.display_name AS "modelName",
            ledger.entry_type AS "entryType", ledger.points_delta::text AS "pointsDelta",
            ledger.input_tokens AS "inputTokens",
            ledger.cached_input_tokens AS "cachedInputTokens",
            ledger.output_tokens AS "outputTokens", ledger.created_at AS "createdAt"
       FROM ${schema}.ai_usage_ledger AS ledger
       JOIN "user" AS identity ON identity.id = ledger.user_id
       LEFT JOIN ${schema}.ai_models AS model ON model.id = ledger.model_id
       LEFT JOIN ${schema}.ai_runs AS run ON run.id = ledger.run_id
       LEFT JOIN ${schema}.resumes AS resume ON resume.id = run.resume_id AND resume.user_id = run.user_id
       ${where}
      ORDER BY ledger.created_at DESC, ledger.id DESC
      LIMIT $${limit} OFFSET $${offset}`,
    values,
  );
}

export async function resolveAiAdminSettlement(input: {
  actorUserId: string;
  runId: string;
  decision: "charge_reserved" | "release";
}) {
  const targetStatus = input.decision === "release" ? "failed" : "complete";
  const [run] = await db
    .update(aiRuns)
    .set({
      status: targetStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(aiRuns.id, input.runId), eq(aiRuns.status, "settlement_pending")))
    .returning();
  if (!run) {
    const [existing] = await db
      .select({ id: aiRuns.id })
      .from(aiRuns)
      .where(eq(aiRuns.id, input.runId))
      .limit(1);
    if (!existing) throw new AiAdminNotFoundError();
    throw new AiAdminStateConflictError();
  }
  try {
    if (input.decision === "release") {
      await releaseAiQuota({ userId: run.userId, runId: run.id, operationId: run.id });
    } else {
      await settleAiQuota({
        userId: run.userId,
        runId: run.id,
        operationId: run.id,
        actualPoints: run.reservedPoints,
        inputTokens: run.inputTokens ?? 0,
        cachedInputTokens: run.cachedInputTokens ?? 0,
        outputTokens: run.outputTokens ?? 0,
      });
    }
  } catch (error) {
    await db
      .update(aiRuns)
      .set({ status: "settlement_pending", updatedAt: new Date() })
      .where(and(eq(aiRuns.id, run.id), eq(aiRuns.status, targetStatus)));
    throw error;
  }
  await db.update(aiRuns).set({
    finalPoints: input.decision === "release" ? 0 : run.reservedPoints,
    completedAt: run.completedAt ?? new Date(),
    updatedAt: new Date(),
  }).where(eq(aiRuns.id, run.id));
  await writeAdminAuditEvent({
    actorUserId: input.actorUserId,
    action: "ai.settlement.resolve",
    targetType: "ai_run",
    targetId: run.id,
    outcome: "success",
    metadata: { decision: input.decision, userId: run.userId, reservedPoints: run.reservedPoints },
  });
  return { runId: run.id, decision: input.decision };
}

export async function getAiAdminAuditEvidence(input: {
  actorUserId: string;
  runId: string;
  encryptionKey: Buffer;
}) {
  const [row] = await db
    .select({
      runId: aiAuditPayloads.runId,
      encryptedRequest: aiAuditPayloads.encryptedRequest,
      encryptedResponse: aiAuditPayloads.encryptedResponse,
      payloadHash: aiAuditPayloads.payloadHash,
      expiresAt: aiAuditPayloads.expiresAt,
    })
    .from(aiAuditPayloads)
    .innerJoin(aiRuns, eq(aiRuns.id, aiAuditPayloads.runId))
    .where(eq(aiAuditPayloads.runId, input.runId))
    .orderBy(desc(aiAuditPayloads.createdAt))
    .limit(1);
  if (!row) throw new AiAdminNotFoundError();
  const evidence = row.encryptedResponse
    ? decryptAiAuditEvidence(
        {
          encryptedRequest: row.encryptedRequest,
          encryptedResponse: row.encryptedResponse,
        },
        input.encryptionKey,
      )
    : {
        request: JSON.parse(
          decryptAiCredential(row.encryptedRequest, input.encryptionKey),
        ) as unknown,
        response: null,
      };
  await writeAdminAuditEvent({
    actorUserId: input.actorUserId,
    action: "ai.audit_evidence.read",
    targetType: "ai_run",
    targetId: row.runId,
    outcome: "success",
    metadata: { payloadHash: row.payloadHash, expiresAt: row.expiresAt },
  });
  return { ...evidence, runId: row.runId, payloadHash: row.payloadHash, expiresAt: row.expiresAt };
}
