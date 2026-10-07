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
  let roleId = "";

  beforeAll(async () => {
    const pool = getDatabasePool();
    for (const [id, name] of [
      [actorId, "Actor"],
      [activeId, "Active"],
      [pendingId, "Pending"],
      [deletedId, "Deleted"],
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
        (user_id, status, deletion_requested_at, deletion_due_at, deleted_at)
       VALUES
        ($1, 'pending_deletion', $3, $4, NULL),
        ($2, 'deleted', $3, $4, $4)`,
      [
        pendingId,
        deletedId,
        new Date("2026-10-07T00:00:00.000Z"),
        new Date("2026-10-14T00:00:00.000Z"),
      ],
    );
  });

  afterAll(async () => {
    const pool = getDatabasePool();
    await pool.query(`DELETE FROM ${schema}.admin_assignments WHERE role_id = $1`, [roleId]);
    await pool.query(`DELETE FROM ${schema}.admin_roles WHERE id = $1`, [roleId]);
    await pool.query(`DELETE FROM ${schema}.admin_principals WHERE user_id = $1`, [actorId]);
    await pool.query(
      `DELETE FROM ${schema}.account_lifecycle WHERE user_id = ANY($1::text[])`,
      [[pendingId, deletedId]],
    );
    await pool.query(
      `DELETE FROM "user" WHERE id = ANY($1::text[])`,
      [[actorId, activeId, pendingId, deletedId]],
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
  });
});
