import { randomUUID } from "node:crypto";

import {
  AdminManagementConflictError,
  revokeUserSessions,
  setAdminRoles,
} from "@/lib/admin/management";
import { listAdminUsers, listAssignableAdminUsers } from "@/lib/admin/query";
import { getDatabasePool } from "@/lib/runtime/database";
import { getDatabaseSchemaName } from "@/db";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("admin account lifecycle visibility", () => {
  const marker = `admin-lifecycle-${randomUUID()}`;
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const actorId = `${marker}-actor`;
  const activeId = `${marker}-active`;
  const pendingId = `${marker}-pending`;
  const deletedId = `${marker}-deleted`;
  const mergedId = `${marker}-merged`;
  const mergedIntoId = `${marker}-merged-into`;
  const mergeAttemptId = randomUUID();
  const mergeOperationId = randomUUID();
  let roleId = "";

  beforeAll(async () => {
    const pool = getDatabasePool();
    for (const [id, name] of [
      [actorId, "Actor"],
      [activeId, "Active"],
      [pendingId, "Pending"],
      [deletedId, "Deleted"],
      [mergedId, "Merged account"],
      [mergedIntoId, "Primary account"],
    ]) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, now(), now())`,
        [id, `${marker} ${name}`, `${id}@example.com`],
      );
    }
    await pool.query(
      `INSERT INTO ${schema}.admin_principals (user_id, kind)
       VALUES ($1, 'delegated_admin')`,
      [actorId],
    );
    const role = await pool.query<{ id: string }>(
      `INSERT INTO ${schema}.admin_roles
        (name, description, permissions, created_by_user_id)
       VALUES ($1, 'Lifecycle role', '["users.read"]'::jsonb, $2)
       RETURNING id::text`,
      [`${marker} Role`, actorId],
    );
    roleId = role.rows[0]!.id;
    await pool.query(
      `INSERT INTO ${schema}.account_lifecycle
        (user_id, status, deletion_requested_at, deletion_due_at, deleted_at,
         merged_into_user_id, merged_at)
       VALUES
        ($1, 'pending_deletion', $3, $4, NULL, NULL, NULL),
        ($2, 'deleted', $3, $4, $4, NULL, NULL),
        ($5, 'merged', NULL, NULL, NULL, $6, $7)`,
      [
        pendingId,
        deletedId,
        new Date("2026-10-07T00:00:00.000Z"),
        new Date("2026-10-14T00:00:00.000Z"),
        mergedId,
        mergedIntoId,
        new Date("2026-10-09T08:00:00.000Z"),
      ],
    );
    await pool.query(
      `INSERT INTO ${schema}.account_social_link_attempts
        (id, initiating_user_id, session_binding_hash, token_hash, provider_id,
         provider_account_id, state, expires_at, consumed_at)
       VALUES ($1, $2, $3, $4, 'github', $5, 'consumed', now(), now())`,
      [mergeAttemptId, mergedIntoId, randomUUID(), randomUUID(), randomUUID()],
    );
    await pool.query(
      `INSERT INTO ${schema}.account_merge_operations
        (id, link_attempt_id, initiating_user_id, target_user_id,
         primary_user_id, secondary_user_id, provider_id, provider_account_id,
         state, confirm_not_before, confirmed_at, status_token_hash, locale,
         source_email_masked, source_email_digest, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $3, $4, 'github', $5, 'completed', now(), now(),
         $6, 'zh-CN', 'm***@example.com', $7, now(), $8)`,
      [
        mergeOperationId,
        mergeAttemptId,
        mergedIntoId,
        mergedId,
        randomUUID(),
        randomUUID(),
        randomUUID(),
        new Date("2026-10-09T08:00:00.000Z"),
      ],
    );
  });

  afterAll(async () => {
    const pool = getDatabasePool();
    await pool.query(`DELETE FROM ${schema}.admin_assignments WHERE role_id = $1`, [roleId]);
    await pool.query(`DELETE FROM ${schema}.admin_roles WHERE id = $1`, [roleId]);
    await pool.query(`DELETE FROM ${schema}.admin_principals WHERE user_id = $1`, [actorId]);
    await pool.query(`DELETE FROM ${schema}.account_merge_operations WHERE id = $1`, [mergeOperationId]);
    await pool.query(`DELETE FROM ${schema}.account_social_link_attempts WHERE id = $1`, [mergeAttemptId]);
    await pool.query(
      `DELETE FROM ${schema}.account_lifecycle WHERE user_id = ANY($1::text[])`,
      [[pendingId, deletedId, mergedId]],
    );
    await pool.query(
      `DELETE FROM "user" WHERE id = ANY($1::text[])`,
      [[actorId, activeId, pendingId, deletedId, mergedId, mergedIntoId]],
    );
  });

  it("returns pending and deleted lifecycle details in the user list", async () => {
    const result = await listAdminUsers({ page: 1, pageSize: 20, query: marker });

    expect(result.items.find((user) => user.id === pendingId)).toMatchObject({
      lifecycleStatus: "pending_deletion",
      deletionDueAt: new Date("2026-10-14T00:00:00.000Z"),
    });
    expect(result.items.find((user) => user.id === deletedId)).toMatchObject({
      lifecycleStatus: "deleted",
      deletedAt: new Date("2026-10-14T00:00:00.000Z"),
    });
    expect(result.items.find((user) => user.id === mergedId)).toMatchObject({
      lifecycleStatus: "merged",
      mergedAt: new Date("2026-10-09T08:00:00.000Z"),
      sourceEmailMasked: "m***@example.com",
      mergedInto: {
        id: mergedIntoId,
        name: `${marker} Primary account`,
        email: `${mergedIntoId}@example.com`,
      },
    });
  });

  it("excludes non-active accounts from administrator assignment candidates", async () => {
    const result = await listAssignableAdminUsers({
      page: 1,
      pageSize: 20,
      query: marker,
    });

    expect(result.items.map((user) => user.id)).toContain(activeId);
    expect(result.items.map((user) => user.id)).not.toContain(pendingId);
    expect(result.items.map((user) => user.id)).not.toContain(deletedId);
    expect(result.items.map((user) => user.id)).not.toContain(mergedId);
  });

  it("rejects session and role mutations for a pending account", async () => {
    await expect(revokeUserSessions(actorId, pendingId)).rejects.toBeInstanceOf(
      AdminManagementConflictError,
    );
    await expect(setAdminRoles({
      actorUserId: actorId,
      userId: pendingId,
      roleIds: [roleId],
    })).rejects.toBeInstanceOf(AdminManagementConflictError);

    await expect(revokeUserSessions(actorId, mergedId)).rejects.toBeInstanceOf(
      AdminManagementConflictError,
    );
    await expect(setAdminRoles({
      actorUserId: actorId,
      userId: mergedId,
      roleIds: [roleId],
    })).rejects.toBeInstanceOf(AdminManagementConflictError);
  });
});
