import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { adminAssignments, adminRoles, db, getDatabaseSchemaName } from "@/db";
import {
  AdminManagementConflictError,
  assignAdminRole,
  createAdminRole,
  removeDelegatedAdmin,
  restoreUser,
  revokeUserSessions,
  suspendUser,
  updateAdminRole,
} from "@/lib/admin-management";
import { getAdminAccessForUser } from "@/lib/admin-store";
import { getDatabasePool } from "@/lib/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("admin role management", () => {
  const userId = `admin-test-${randomUUID()}`;
  const superAdminId = `admin-test-${randomUUID()}`;
  const delegatedActorId = `admin-test-${randomUUID()}`;
  const delegatedTargetId = `admin-test-${randomUUID()}`;
  const productTargetId = `admin-test-${randomUUID()}`;

  beforeAll(async () => {
    const pool = getDatabasePool();
    for (const id of [
      userId,
      superAdminId,
      delegatedActorId,
      delegatedTargetId,
      productTargetId,
    ]) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, 'Admin test', $2, true, now(), now())`,
        [id, `${id}@example.com`],
      );
    }
    const schema = quoteIdentifier(getDatabaseSchemaName());
    await pool.query(
      `INSERT INTO ${schema}.admin_principals
       (user_id, kind, singleton_slot) VALUES ($1, 'super_admin', 1)`,
      [superAdminId],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_principals (user_id, kind)
       VALUES ($1, 'delegated_admin'), ($2, 'delegated_admin')`,
      [delegatedActorId, delegatedTargetId],
    );
  });

  afterAll(async () => {
    const schema = quoteIdentifier(getDatabaseSchemaName());
    await getDatabasePool().query(
      `TRUNCATE ${schema}.admin_audit_events, ${schema}.admin_sessions,
        ${schema}.admin_assignments, ${schema}.admin_roles,
        ${schema}.admin_principals CASCADE`,
    );
    await getDatabasePool().query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [
      [
        userId,
        superAdminId,
        delegatedActorId,
        delegatedTargetId,
        productTargetId,
      ],
    ]);
  });

  it("assigns exactly one current role and invalidates access on updates", async () => {
    const created = await createAdminRole({
      actorUserId: superAdminId,
      name: "Support",
      description: "Support operators",
      permissions: ["users.read"],
    });
    await assignAdminRole({ actorUserId: superAdminId, userId, roleId: created.id });

    await expect(getAdminAccessForUser(userId)).resolves.toMatchObject({
      kind: "delegated_admin",
      accessVersion: 1,
      permissions: ["users.read"],
    });

    await updateAdminRole({
      actorUserId: superAdminId,
      roleId: created.id,
      name: "Support",
      description: "Updated",
      permissions: ["users.read", "users.sessions.revoke"],
    });

    await expect(getAdminAccessForUser(userId)).resolves.toMatchObject({
      accessVersion: 2,
      permissions: ["users.read", "users.sessions.revoke"],
    });
    expect(await db.select().from(adminAssignments)).toHaveLength(1);

    await removeDelegatedAdmin(superAdminId, userId);
    await expect(getAdminAccessForUser(userId)).resolves.toBeNull();
    await db.delete(adminRoles).where(eq(adminRoles.id, created.id));
  });

  it("never overwrites the singleton super-admin with a delegated role", async () => {
    const created = await createAdminRole({
      actorUserId: superAdminId,
      name: "Auditor",
      description: "Read only",
      permissions: ["audit.read"],
    });

    await expect(
      assignAdminRole({
        actorUserId: superAdminId,
        userId: superAdminId,
        roleId: created.id,
      }),
    ).rejects.toBeInstanceOf(AdminManagementConflictError);
  });

  it("prevents delegated administrators from disrupting management identities", async () => {
    await expect(
      revokeUserSessions(delegatedActorId, superAdminId),
    ).rejects.toBeInstanceOf(AdminManagementConflictError);
    await expect(
      suspendUser({
        actorUserId: delegatedActorId,
        userId: delegatedTargetId,
        reason: "Not allowed",
      }),
    ).rejects.toBeInstanceOf(AdminManagementConflictError);
    await expect(
      restoreUser(delegatedActorId, delegatedTargetId),
    ).rejects.toBeInstanceOf(AdminManagementConflictError);
  });

  it("allows delegated administrators to operate on product-only users", async () => {
    await expect(
      suspendUser({
        actorUserId: delegatedActorId,
        userId: productTargetId,
        reason: "Support action",
      }),
    ).resolves.toBeUndefined();
    await expect(
      restoreUser(delegatedActorId, productTargetId),
    ).resolves.toBeUndefined();
    await expect(
      revokeUserSessions(delegatedActorId, productTargetId),
    ).resolves.toBeUndefined();
  });
});
