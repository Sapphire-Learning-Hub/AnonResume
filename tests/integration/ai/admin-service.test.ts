import { randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";
import {
  AiAdminStateConflictError,
  createAiAdminModel,
  deleteAiAdminProvider,
  deleteAiAdminModel,
  listAiAdminLedger,
  listAiAdminProviders,
  listAiAdminQuotas,
  updateAiAdminModel,
  updateAiAdminQuota,
} from "@/lib/ai/admin/service";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("AI administration service", () => {
  const marker = `ai-admin-${randomUUID()}`;
  const userId = `${marker}-user`;
  const actorUserId = `${marker}-actor`;
  const providerId = randomUUID();
  const multiProviderId = randomUUID();
  const activeDeleteProviderId = randomUUID();
  const disabledDeleteProviderId = randomUUID();
  const modelId = randomUUID();
  const disabledDeleteModelId = randomUUID();
  const schema = quoteIdentifier(getDatabaseSchemaName());

  beforeAll(async () => {
    const pool = getDatabasePool();
    for (const [id, suffix] of [[userId, "user"], [actorUserId, "actor"]]) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, now(), now())`,
        [id, `${marker} ${suffix}`, `${marker}-${suffix}@example.com`],
      );
    }
    await pool.query(
      `INSERT INTO ${schema}.ai_provider_credentials
         (id, kind, display_name, base_url, encrypted_api_key, enabled)
       VALUES ($1, 'platform', $2, 'https://example.com/v1', $3, true),
              ($4, 'platform', $5, 'https://example.com/v1', $3, true),
              ($6, 'platform', $7, 'https://example.com/v1', $3, true),
              ($8, 'platform', $9, 'https://example.com/v1', $3, false)`,
      [
        providerId,
        `${marker} provider`,
        Buffer.from("encrypted"),
        multiProviderId,
        `${marker} multi provider`,
        activeDeleteProviderId,
        `${marker} active delete provider`,
        disabledDeleteProviderId,
        `${marker} disabled delete provider`,
      ],
    );
    await pool.query(
      `INSERT INTO ${schema}.ai_models
         (id, provider_id, provider_model_key, display_name, enabled,
          supports_streaming, supports_tool_calls, context_window,
          max_output_tokens, input_point_rate, cached_input_point_rate,
          output_point_rate)
       VALUES ($1, $2, $3, $4, true, true, true, 128000, 4096, 1, 1, 1)`,
      [modelId, providerId, `${marker}-model`, `${marker} model`],
    );
    await pool.query(
      `INSERT INTO ${schema}.ai_models
         (id, provider_id, provider_model_key, display_name, enabled,
          supports_streaming, supports_tool_calls, context_window,
          max_output_tokens, input_point_rate, cached_input_point_rate,
          output_point_rate)
       VALUES ($1, $2, $3, $4, false, true, true, 128000, 4096, 1, 1, 1)`,
      [
        disabledDeleteModelId,
        disabledDeleteProviderId,
        `${marker}-delete-model`,
        `${marker} delete model`,
      ],
    );
  });

  afterAll(async () => {
    const pool = getDatabasePool();
    await pool.query(
      `DELETE FROM ${schema}.admin_audit_events WHERE actor_user_id = $1`,
      [actorUserId],
    );
    await pool.query(`DELETE FROM ${schema}.ai_usage_ledger WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM ${schema}.ai_quota_accounts WHERE user_id = $1`, [userId]);
    await pool.query(
      `DELETE FROM ${schema}.ai_models WHERE provider_id = ANY($1::uuid[])`,
      [[
        providerId,
        multiProviderId,
        activeDeleteProviderId,
        disabledDeleteProviderId,
      ]],
    );
    await pool.query(
      `DELETE FROM ${schema}.ai_provider_credentials WHERE id = ANY($1::uuid[])`,
      [[
        providerId,
        multiProviderId,
        activeDeleteProviderId,
        disabledDeleteProviderId,
      ]],
    );
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [[userId, actorUserId]]);
  });

  it("soft-deletes only disabled providers and their models", async () => {
    await expect(deleteAiAdminProvider({
      actorUserId,
      providerId: activeDeleteProviderId,
    })).rejects.toBeInstanceOf(AiAdminStateConflictError);

    await deleteAiAdminProvider({
      actorUserId,
      providerId: disabledDeleteProviderId,
    });

    const pool = getDatabasePool();
    const stored = await pool.query<{
      modelDeletedAt: Date | null;
      providerDeletedAt: Date | null;
    }>(
      `SELECT provider.deleted_at AS "providerDeletedAt",
              model.deleted_at AS "modelDeletedAt"
         FROM ${schema}.ai_provider_credentials AS provider
         JOIN ${schema}.ai_models AS model ON model.provider_id = provider.id
        WHERE provider.id = $1 AND model.id = $2`,
      [disabledDeleteProviderId, disabledDeleteModelId],
    );
    expect(stored.rows[0]?.providerDeletedAt).toBeInstanceOf(Date);
    expect(stored.rows[0]?.modelDeletedAt).toBeInstanceOf(Date);

    const listed = await listAiAdminProviders({
      page: 1,
      pageSize: 10,
      query: `${marker} disabled delete provider`,
    });
    expect(listed.items).toEqual([]);
  });

  it("soft-deletes only disabled models and permits the model key to be reused", async () => {
    await expect(deleteAiAdminModel({
      actorUserId,
      modelId,
      providerId,
    })).rejects.toBeInstanceOf(AiAdminStateConflictError);

    const pool = getDatabasePool();
    await pool.query(
      `UPDATE ${schema}.ai_provider_credentials SET enabled = false WHERE id = $1`,
      [providerId],
    );
    await pool.query(
      `UPDATE ${schema}.ai_models SET enabled = false WHERE id = $1`,
      [modelId],
    );

    await deleteAiAdminModel({ actorUserId, modelId, providerId });

    const stored = await pool.query<{ deletedAt: Date | null }>(
      `SELECT deleted_at AS "deletedAt" FROM ${schema}.ai_models WHERE id = $1`,
      [modelId],
    );
    expect(stored.rows[0]?.deletedAt).toBeInstanceOf(Date);

    const listed = await listAiAdminProviders({
      page: 1,
      pageSize: 10,
      query: `${marker} model`,
    });
    expect(listed.items).toEqual([]);

    await expect(pool.query(
      `INSERT INTO ${schema}.ai_models
         (provider_id, provider_model_key, display_name, enabled,
          supports_streaming, supports_tool_calls, context_window,
          max_output_tokens, input_point_rate, cached_input_point_rate,
          output_point_rate)
       VALUES ($1, $2, $3, false, true, true, 128000, 4096, 1, 1, 1)`,
      [providerId, `${marker}-model`, `${marker} replacement model`],
    )).resolves.toBeDefined();
  });

  it("creates and independently updates multiple models for one provider", async () => {
    const first = await createAiAdminModel({
      actorUserId,
      providerId: multiProviderId,
      value: {
        providerModelKey: `${marker}-first-managed-model`,
        displayName: `${marker} first managed model`,
        enabled: true,
        supportsToolCalls: true,
        contextWindow: 128_000,
        maxOutputTokens: 4_096,
        inputPointRate: 10,
        cachedInputPointRate: 5,
        outputPointRate: 20,
        freeModel: false,
      },
    });
    const second = await createAiAdminModel({
      actorUserId,
      providerId: multiProviderId,
      value: {
        providerModelKey: `${marker}-second-managed-model`,
        displayName: `${marker} second managed model`,
        enabled: true,
        supportsToolCalls: false,
        contextWindow: 64_000,
        maxOutputTokens: 2_048,
        inputPointRate: 10,
        cachedInputPointRate: 5,
        outputPointRate: 20,
        freeModel: false,
      },
    });
    expect(first.providerId).toBe(multiProviderId);
    expect(second.providerId).toBe(multiProviderId);

    const updated = await updateAiAdminModel({
      actorUserId,
      providerId: multiProviderId,
      modelId: second.modelId,
      value: {
        providerModelKey: `${marker}-second-model-v2`,
        displayName: `${marker} second model v2`,
        enabled: false,
        supportsToolCalls: true,
        contextWindow: 96_000,
        maxOutputTokens: 4_096,
        inputPointRate: 12,
        cachedInputPointRate: 6,
        outputPointRate: 24,
        freeModel: false,
      },
    });
    expect(updated).toMatchObject({
      modelId: second.modelId,
      providerId: multiProviderId,
    });

    const listed = await listAiAdminProviders({
      page: 1,
      pageSize: 10,
      query: `${marker} multi provider`,
    });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ modelId: first.modelId }),
      expect.objectContaining({
        modelId: second.modelId,
        modelName: `${marker} second model v2`,
        modelEnabled: false,
      }),
    ]));
  });

  it("updates a quota with immutable usage and management audit records", async () => {
    const initialPeriod = {
      periodStartedAt: new Date("2026-09-01T00:00:00.000Z"),
      periodEndsAt: new Date("2026-10-01T00:00:00.000Z"),
    };
    await updateAiAdminQuota({
      actorUserId,
      userId,
      monthlyLimit: 24_000,
      ...initialPeriod,
    });
    await getDatabasePool().query(
      `UPDATE ${schema}.ai_quota_accounts
          SET used_points = 120, reserved_points = 30
        WHERE user_id = $1`,
      [userId],
    );
    const defaultPeriod = {
      periodStartedAt: new Date("2026-09-15T00:00:00.000Z"),
      periodEndsAt: new Date("2026-10-15T00:00:00.000Z"),
    };
    await updateAiAdminQuota({
      actorUserId,
      userId,
      monthlyLimit: 100_000,
      ...defaultPeriod,
    });

    const quotas = await listAiAdminQuotas(
      { page: 1, pageSize: 10, query: `${marker}-user@example.com` },
      100_000,
    );
    expect(quotas.items).toEqual([
      expect.objectContaining({
        userId,
        monthlyLimit: "100000",
        customLimit: false,
        usedPoints: "120",
        reservedPoints: "30",
        periodStartedAt: defaultPeriod.periodStartedAt,
        periodEndsAt: defaultPeriod.periodEndsAt,
      }),
    ]);

    const ledger = await listAiAdminLedger({
      page: 1,
      pageSize: 10,
      query: `${marker}-user@example.com`,
    });
    expect(ledger.items).toHaveLength(2);
    expect(ledger.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId, entryType: "adjustment", pointsDelta: "0" }),
    ]));

    const audit = await getDatabasePool().query<{ action: string; metadata: unknown }>(
      `SELECT action, metadata FROM ${schema}.admin_audit_events
       WHERE actor_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [actorUserId],
    );
    expect(audit.rows[0]).toMatchObject({ action: "ai.quota.update" });
    expect(JSON.stringify(audit.rows[0]?.metadata)).not.toContain("content");
  });
});
