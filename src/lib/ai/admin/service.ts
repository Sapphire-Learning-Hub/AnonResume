import { and, desc, eq, sql } from "drizzle-orm";
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
  model: {
    id?: string;
    providerModelKey: string;
    displayName: string;
    enabled: boolean;
    supportsToolCalls: boolean;
    contextWindow: number;
    maxOutputTokens: number;
    inputPointRate: number;
    cachedInputPointRate: number;
    outputPointRate: number;
  };
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
  const where = query
    ? "WHERE provider.kind = 'platform' AND (provider.display_name ILIKE $1 OR model.display_name ILIKE $1 OR model.provider_model_key ILIKE $1)"
    : "WHERE provider.kind = 'platform'";
  const values = query ? [query] : [];
  const limit = values.length + 1;
  const offset = values.length + 2;

  return runPagedQuery<{
    providerId: string;
    providerName: string;
    baseUrl: string;
    providerEnabled: boolean;
    modelId: string;
    modelKey: string;
    modelName: string;
    modelEnabled: boolean;
    supportsToolCalls: boolean;
    contextWindow: number;
    maxOutputTokens: number;
    inputPointRate: string;
    cachedInputPointRate: string;
    outputPointRate: string;
    rateCardVersion: number;
  }>(
    request,
    `SELECT count(*)::text AS total
       FROM ${schema}.ai_provider_credentials AS provider
       JOIN ${schema}.ai_models AS model ON model.provider_id = provider.id
       ${where}`,
    `SELECT provider.id::text AS "providerId", provider.display_name AS "providerName",
            provider.base_url AS "baseUrl", provider.enabled AS "providerEnabled",
            model.id::text AS "modelId", model.provider_model_key AS "modelKey",
            model.display_name AS "modelName", model.enabled AS "modelEnabled",
            model.supports_tool_calls AS "supportsToolCalls",
            model.context_window AS "contextWindow",
            model.max_output_tokens AS "maxOutputTokens",
            model.input_point_rate::text AS "inputPointRate",
            model.cached_input_point_rate::text AS "cachedInputPointRate",
            model.output_point_rate::text AS "outputPointRate",
            model.rate_card_version AS "rateCardVersion"
       FROM ${schema}.ai_provider_credentials AS provider
       JOIN ${schema}.ai_models AS model ON model.provider_id = provider.id
       ${where}
      ORDER BY lower(provider.display_name), lower(model.display_name), model.id
      LIMIT $${limit} OFFSET $${offset}`,
    values,
  );
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

    const modelValues = {
      providerId,
      providerModelKey: input.value.model.providerModelKey,
      displayName: input.value.model.displayName,
      enabled: input.value.model.enabled,
      supportsToolCalls: input.value.model.supportsToolCalls,
      contextWindow: input.value.model.contextWindow,
      maxOutputTokens: input.value.model.maxOutputTokens,
      inputPointRate: input.value.model.inputPointRate,
      cachedInputPointRate: input.value.model.cachedInputPointRate,
      outputPointRate: input.value.model.outputPointRate,
      updatedAt: new Date(),
    };
    let modelId = input.value.model.id;
    if (modelId) {
      const [updated] = await transaction
        .update(aiModels)
        .set({
          ...modelValues,
          rateCardVersion: sql`${aiModels.rateCardVersion} + 1`,
        })
        .where(and(eq(aiModels.id, modelId), eq(aiModels.providerId, providerId)))
        .returning({ id: aiModels.id });
      if (!updated) throw new AiAdminNotFoundError();
    } else {
      const [created] = await transaction
        .insert(aiModels)
        .values(modelValues)
        .returning({ id: aiModels.id });
      modelId = created!.id;
    }
    return { providerId, modelId };
  });

  await writeAdminAuditEvent({
    actorUserId: input.actorUserId,
    action: input.providerId ? "ai.provider.update" : "ai.provider.create",
    targetType: "ai_provider",
    targetId: result.providerId,
    outcome: "success",
    metadata: {
      modelId: result.modelId,
      providerName: input.value.displayName,
      modelName: input.value.model.displayName,
      enabled: input.value.enabled,
      modelEnabled: input.value.model.enabled,
      rates: {
        input: input.value.model.inputPointRate,
        cachedInput: input.value.model.cachedInputPointRate,
        output: input.value.model.outputPointRate,
      },
    },
  });
  return result;
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
            (quota.user_id IS NOT NULL) AS "customLimit",
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
}) {
  return withTransaction(async (client) => {
    const identity = await client.query<{ id: string; name: string; email: string }>(
      `SELECT id, name, email FROM "user" WHERE id = $1`,
      [input.userId],
    );
    if (!identity.rows[0]) throw new AiAdminNotFoundError();
    const current = await client.query<{ monthlyLimit: string }>(
      `SELECT monthly_limit::text AS "monthlyLimit"
         FROM ${schemaName()}.ai_quota_accounts WHERE user_id = $1 FOR UPDATE`,
      [input.userId],
    );
    const previousLimit = current.rows[0] ? Number(current.rows[0].monthlyLimit) : null;
    await client.query(
      `INSERT INTO ${schemaName()}.ai_quota_accounts
         (user_id, monthly_limit, period_started_at, period_ends_at)
       VALUES ($1, $2, now(), now() + interval '1 month')
       ON CONFLICT (user_id) DO UPDATE
         SET monthly_limit = EXCLUDED.monthly_limit, updated_at = now()`,
      [input.userId, input.monthlyLimit],
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
        resources: [{
          type: "user",
          id: input.userId,
          label: identity.rows[0].name,
          description: identity.rows[0].email,
        }],
      },
    });
    return { userId: input.userId, monthlyLimit: input.monthlyLimit };
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
