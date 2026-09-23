import { randomUUID } from "node:crypto";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  classifyConfigurationRuntimeState,
  getAdminSystemStatus,
  listAdminAdministrators,
  listAdminAuditEvents,
  listAdminExports,
  listAdminResumeMetadata,
  listAdminRoles,
  listAdminUsers,
  listAdminWorkers,
  listAssignableAdminUsers,
} from "@/lib/admin/query";
import { getDatabasePool } from "@/lib/runtime/database";
import { getDatabaseSchemaName } from "@/db";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("admin paginated queries", () => {
  const marker = `page-${randomUUID()}`;
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const userIds = Array.from({ length: 3 }, (_, index) => `${marker}-user-${index}`);
  const roleIds: string[] = [];

  beforeAll(async () => {
    const pool = getDatabasePool();
    for (const [index, userId] of userIds.entries()) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $5, $4, $4)`,
        [
          userId,
          `${marker} User ${index}`,
          `${marker}-${index}@example.com`,
          new Date(Date.UTC(2026, 0, index + 1)),
          index !== 2,
        ],
      );
      await pool.query(
        `INSERT INTO ${schema}.resumes
          (id, user_id, name, summary, document, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [
          `${marker}-resume-${index}`,
          userId,
          `${marker} Resume ${index}`,
          `${marker} Summary`,
          createDefaultResumeDocument(),
          new Date(Date.UTC(2026, 1, index + 1)),
        ],
      );
    }
    const role = await pool.query<{ id: string }>(
      `INSERT INTO ${schema}.admin_roles
        (name, description, permissions, created_by_user_id)
       VALUES ($1, 'Pagination role', '["users.read"]'::jsonb, $2)
       RETURNING id::text`,
      [`${marker} Role`, userIds[0]],
    );
    roleIds.push(role.rows[0]!.id);
    const secondRole = await pool.query<{ id: string }>(
      `INSERT INTO ${schema}.admin_roles
        (name, description, permissions, created_by_user_id)
       VALUES ($1, 'Second pagination role', '["audit.read"]'::jsonb, $2)
       RETURNING id::text`,
      [`${marker} Second role`, userIds[0]],
    );
    roleIds.push(secondRole.rows[0]!.id);
    await pool.query(
      `INSERT INTO ${schema}.admin_principals (user_id, kind)
       VALUES ($1, 'delegated_admin')`,
      [userIds[0]],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_assignments
        (user_id, role_id, assigned_by_user_id)
       VALUES ($1, $2, $1), ($1, $3, $1)`,
      [userIds[0], roleIds[0], roleIds[1]],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_activation_tokens
        (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'product_user', $2, now() - interval '1 hour')`,
      [userIds[2], `${marker}-expired-invitation`],
    );
    await pool.query(
      `INSERT INTO ${schema}.pdf_export_jobs
        (resume_user_id, resume_id, requester_user_id, access_token_hash, document, filename)
       VALUES ($1, $2, $1, 'pagination-token', $3, $4)`,
      [userIds[0], `${marker}-resume-0`, createDefaultResumeDocument(), `${marker}.pdf`],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_audit_events
        (actor_user_id, action, target_type, target_id, outcome, metadata,
         request_id, ip_hash)
       VALUES ($1, $2, 'user', $1, 'success', $3::jsonb, $4, $5)`,
      [
        userIds[0],
        `${marker}.action`,
        JSON.stringify({
          roleIds: [roleIds[0]],
          targetSnapshot: {
            label: `${marker} Historical user`,
            description: `${marker}-historical@example.com`,
          },
        }),
        `${marker}-request`,
        `${marker}-ip-hash`,
      ],
    );
    await pool.query(
      `INSERT INTO ${schema}.worker_heartbeats
        (worker_id, session_id, worker_type, release, started_at, last_seen_at, metadata)
       VALUES ($1, $2, 'pdf', 'test', now(), now(), '{}'::jsonb)`,
      [`${marker}-worker`, `${marker}-session`],
    );
  });

  afterAll(async () => {
    const pool = getDatabasePool();
    await pool.query(`DELETE FROM ${schema}.worker_heartbeats WHERE worker_id LIKE $1`, [`${marker}%`]);
    await pool.query(`DELETE FROM ${schema}.admin_audit_events WHERE action = $1`, [`${marker}.action`]);
    await pool.query(`DELETE FROM ${schema}.pdf_export_jobs WHERE filename = $1`, [`${marker}.pdf`]);
    await pool.query(
      `DELETE FROM ${schema}.admin_activation_tokens WHERE user_id = ANY($1::text[])`,
      [userIds],
    );
    await pool.query(
      `DELETE FROM ${schema}.admin_assignments WHERE role_id = ANY($1::uuid[])`,
      [roleIds],
    );
    await pool.query(`DELETE FROM ${schema}.admin_principals WHERE user_id = ANY($1::text[])`, [userIds]);
    await pool.query(
      `DELETE FROM ${schema}.admin_roles WHERE id = ANY($1::uuid[])`,
      [roleIds],
    );
    await pool.query(`DELETE FROM ${schema}.resumes WHERE user_id = ANY($1::text[])`, [userIds]);
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [userIds]);
  });

  it("paginates users after applying full-dataset search", async () => {
    const result = await listAdminUsers({
      page: 2,
      pageSize: 2,
      query: marker,
    });

    expect(result).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.roles).toHaveLength(2);
  });

  it("does not expose legacy product invitations as management invitations", async () => {
    const result = await listAdminUsers({
      page: 1,
      pageSize: 20,
      query: marker,
    });

    expect(
      result.items.find((user) => user.id === userIds[2])?.invitationPending,
    ).toBe(false);
    expect(
      result.items.find((user) => user.id === userIds[1])?.invitationPending,
    ).toBe(false);
  });

  it("returns pagination metadata for every management list", async () => {
    const request = { page: 1, pageSize: 20, query: marker };
    const [resumes, exports, roles, administrators, events, workers, assignableUsers] = await Promise.all([
      listAdminResumeMetadata(request),
      listAdminExports(request),
      listAdminRoles(request),
      listAdminAdministrators(request),
      listAdminAuditEvents(request),
      listAdminWorkers(request),
      listAssignableAdminUsers(request),
    ]);

    expect(resumes).toMatchObject({ page: 1, pageSize: 20, total: 3, totalPages: 1 });
    expect(resumes.items).toHaveLength(3);
    expect(roles).toMatchObject({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
    expect(roles.items).toHaveLength(2);
    expect(administrators).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(administrators.items[0]?.roles).toHaveLength(2);
    for (const result of [exports, events, workers]) {
      expect(result).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(result.items).toHaveLength(1);
    }
    expect(events.items[0]).toMatchObject({
      actor: {
        description: `${marker}-0@example.com`,
        id: userIds[0],
        label: `${marker} User 0`,
      },
      ipHash: `${marker}-ip-hash`,
      metadata: {
        roleIds: [roleIds[0]],
        targetSnapshot: {
          description: `${marker}-historical@example.com`,
          label: `${marker} Historical user`,
        },
      },
      requestId: `${marker}-request`,
      resourceLabels: {
        [`admin_role:${roleIds[0]}`]: {
          id: roleIds[0],
          label: `${marker} Role`,
          type: "admin_role",
        },
      },
      target: {
        description: `${marker}-historical@example.com`,
        id: userIds[0],
        label: `${marker} Historical user`,
        type: "user",
      },
    });
    expect(assignableUsers).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it("reports the build tag together with the current commit", async () => {
    const previousTag = process.env.ANONRESUME_BUILD_TAG;
    const previousCommit = process.env.ANONRESUME_BUILD_COMMIT;
    process.env.ANONRESUME_BUILD_TAG = "v1.2.3";
    process.env.ANONRESUME_BUILD_COMMIT = "abcdef1234567890abcdef1234567890";

    try {
      await expect(getAdminSystemStatus()).resolves.toMatchObject({
        release: "v1.2.3 · abcdef123456",
      });
    } finally {
      if (previousTag === undefined) {
        delete process.env.ANONRESUME_BUILD_TAG;
      } else {
        process.env.ANONRESUME_BUILD_TAG = previousTag;
      }
      if (previousCommit === undefined) {
        delete process.env.ANONRESUME_BUILD_COMMIT;
      } else {
        process.env.ANONRESUME_BUILD_COMMIT = previousCommit;
      }
    }
  });

  it("classifies configuration runtime synchronization states", () => {
    const now = new Date("2026-09-20T00:02:00.000Z");
    const base = {
      desiredRevisionId: "revision-2",
      fallbackRevisionId: null,
      healthState: "healthy" as const,
      lastSeenAt: new Date("2026-09-20T00:01:45.000Z"),
      loadedHotRevisionId: "revision-2",
      loadedRestartRevisionId: "revision-2",
    };

    expect(classifyConfigurationRuntimeState(base, { now })).toBe("current");
    expect(classifyConfigurationRuntimeState({
      ...base,
      loadedRestartRevisionId: "revision-1",
    }, { now })).toBe("pending_restart");
    expect(classifyConfigurationRuntimeState({
      ...base,
      fallbackRevisionId: "revision-1",
      healthState: "recovery_required",
      loadedHotRevisionId: "revision-1",
      loadedRestartRevisionId: "revision-1",
    }, { now })).toBe("recovery_required");
    expect(classifyConfigurationRuntimeState({
      ...base,
      loadedHotRevisionId: null,
      loadedRestartRevisionId: null,
    }, { now })).toBe("error");
    expect(classifyConfigurationRuntimeState({
      ...base,
      lastSeenAt: new Date("2026-09-20T00:00:00.000Z"),
    }, {
      expectedHeartbeatIntervalMs: 30_000,
      now,
    })).toBe("stale");
  });

  it("reports configuration runtime instances without exposing unknown errors", async () => {
    const pool = getDatabasePool();
    const instanceId = `${marker}-config-runtime`;
    await pool.query(
      `INSERT INTO ${schema}.system_config_runtime_states
        (instance_id, session_id, consumer, release, started_at, health_state,
         last_seen_at, last_error, metadata)
       VALUES ($1, $2, 'web', 'test-release', now(), 'degraded', now(), $3, $4::jsonb)`,
      [
        instanceId,
        `${marker}-config-session`,
        "connection to secret.internal.example failed",
        JSON.stringify({ configurationPollIntervalMs: 60_000 }),
      ],
    );

    try {
      const status = await getAdminSystemStatus();
      expect(status.configurationInstances.find(
        (instance) => instance.instanceId === instanceId,
      )).toMatchObject({
        consumer: "web",
        errorCode: "configuration_runtime_error",
        release: "test-release",
        state: "error",
      });
    } finally {
      await pool.query(
        `DELETE FROM ${schema}.system_config_runtime_states WHERE instance_id = $1`,
        [instanceId],
      );
    }
  });

  it("resolves existing AI model audit targets to their display names", async () => {
    const pool = getDatabasePool();
    const providerId = randomUUID();
    const modelId = randomUUID();
    const modelName = `${marker} AI model`;

    try {
      await pool.query(
        `INSERT INTO ${schema}.ai_provider_credentials
           (id, kind, display_name, base_url, encrypted_api_key, enabled)
         VALUES ($1, 'platform', $2, 'https://example.com/v1', $3, true)`,
        [providerId, `${marker} AI provider`, Buffer.from("encrypted")],
      );
      await pool.query(
        `INSERT INTO ${schema}.ai_models
           (id, provider_id, provider_model_key, display_name, enabled,
            supports_streaming, supports_tool_calls, context_window,
            max_output_tokens, input_point_rate, cached_input_point_rate,
            output_point_rate)
         VALUES ($1, $2, $3, $4, true, true, true, 128000, 4096, 1, 1, 1)`,
        [modelId, providerId, `${marker}-audit-model`, modelName],
      );
      await pool.query(
        `INSERT INTO ${schema}.admin_audit_events
           (action, target_type, target_id, outcome, metadata)
         VALUES ('ai.model.update', 'ai_model', $1, 'success', '{}'::jsonb)`,
        [modelId],
      );

      const events = await listAdminAuditEvents({
        page: 1,
        pageSize: 20,
        query: modelId,
      });

      expect(events.items).toHaveLength(1);
      expect(events.items[0]?.target).toMatchObject({
        id: modelId,
        label: modelName,
        type: "ai_model",
      });
    } finally {
      await pool.query(
        `DELETE FROM ${schema}.admin_audit_events WHERE target_id = $1`,
        [modelId],
      );
      await pool.query(`DELETE FROM ${schema}.ai_models WHERE id = $1`, [modelId]);
      await pool.query(
        `DELETE FROM ${schema}.ai_provider_credentials WHERE id = $1`,
        [providerId],
      );
    }
  });
});
