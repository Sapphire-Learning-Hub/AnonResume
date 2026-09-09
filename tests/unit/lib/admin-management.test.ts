import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { adminAssignments, adminRoles, db, getDatabaseSchemaName } from "@/db";
import {
  AdminManagementConflictError,
  createAdminRole,
  deleteAdminRole,
  restoreUser,
  revokeUserSessions,
  suspendUser,
  setAdminRoles,
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
        ${schema}.admin_assignments, ${schema}.admin_principals CASCADE`,
    );
    await getDatabasePool().query(
      `DELETE FROM ${schema}.admin_roles WHERE system_key IS NULL`,
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

  it("combines multiple roles and versions the complete role set", async () => {
    const supportRole = await createAdminRole({
      actorUserId: superAdminId,
      name: "Support",
      description: "Support operators",
      permissions: ["users.read"],
    });
    const auditRole = await createAdminRole({
      actorUserId: superAdminId,
      name: "Audit",
      description: "Audit operators",
      permissions: ["users.read", "audit.read"],
    });
    await setAdminRoles({
      actorUserId: superAdminId,
      userId,
      roleIds: [supportRole.id, auditRole.id, supportRole.id],
    });

    await expect(getAdminAccessForUser(userId)).resolves.toMatchObject({
      kind: "delegated_admin",
      accessVersion: 1,
      permissions: ["users.read", "audit.read"],
    });
    expect(await db.select().from(adminAssignments)).toHaveLength(2);

    await setAdminRoles({
      actorUserId: superAdminId,
      userId,
      roleIds: [auditRole.id, supportRole.id],
    });
    await expect(getAdminAccessForUser(userId)).resolves.toMatchObject({
      accessVersion: 1,
    });

    await updateAdminRole({
      actorUserId: superAdminId,
      roleId: supportRole.id,
      name: "Support",
      description: "Updated",
      permissions: ["users.read", "users.sessions.revoke"],
    });

    await expect(getAdminAccessForUser(userId)).resolves.toMatchObject({
      accessVersion: 2,
      permissions: ["users.read", "users.sessions.revoke", "audit.read"],
    });

    await setAdminRoles({
      actorUserId: superAdminId,
      userId,
      roleIds: [auditRole.id],
    });
    await expect(getAdminAccessForUser(userId)).resolves.toMatchObject({
      accessVersion: 3,
      permissions: ["users.read", "audit.read"],
    });
    expect(await db.select().from(adminAssignments)).toHaveLength(1);

    await setAdminRoles({
      actorUserId: superAdminId,
      userId,
      roleIds: [],
    });
    await expect(getAdminAccessForUser(userId)).resolves.toBeNull();
    await db.delete(adminRoles).where(eq(adminRoles.id, supportRole.id));
    await db.delete(adminRoles).where(eq(adminRoles.id, auditRole.id));
  });

  it("never overwrites the singleton super-admin with a delegated role", async () => {
    const created = await createAdminRole({
      actorUserId: superAdminId,
      name: "Auditor",
      description: "Read only",
      permissions: ["audit.read"],
    });

    await expect(
      setAdminRoles({
        actorUserId: superAdminId,
        userId: superAdminId,
        roleIds: [created.id],
      }),
    ).rejects.toBeInstanceOf(AdminManagementConflictError);
  });

  it("prevents system roles from being modified or deleted", async () => {
    const schema = quoteIdentifier(getDatabaseSchemaName());
    const result = await getDatabasePool().query<{ id: string }>(
      `SELECT id::text FROM ${schema}.admin_roles
        WHERE system_key = 'read_only_auditor'`,
    );
    const roleId = result.rows[0]!.id;

    await expect(
      updateAdminRole({
        actorUserId: superAdminId,
        roleId,
        name: "Changed",
        description: "Changed",
        permissions: ["users.read"],
      }),
    ).rejects.toBeInstanceOf(AdminManagementConflictError);
    await expect(
      deleteAdminRole(superAdminId, roleId),
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
