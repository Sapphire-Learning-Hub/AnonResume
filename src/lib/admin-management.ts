import { getDatabaseSchemaName } from "@/db";
import type { PoolClient } from "pg";

import type { AdminPermission } from "./admin-permissions";
import { normalizeAdminPermissions } from "./admin-permissions";
import {
  writeAdminAuditEvent,
  writeAdminAuditEventWithClient,
} from "./admin-audit";
import { getDatabasePool } from "./database";
import {
  adminCancelPdfExport,
  adminRetryPdfExport,
} from "./pdf-export-queue";

export class AdminManagementConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminManagementConflictError";
  }
}

export class AdminManagementNotFoundError extends Error {}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function schemaName() {
  return quoteIdentifier(getDatabaseSchemaName());
}

async function assertAdminRoleMutable(
  client: PoolClient,
  schema: string,
  roleId: string,
) {
  const role = await client.query<{ systemKey: string | null }>(
    `SELECT system_key AS "systemKey"
       FROM ${schema}.admin_roles
      WHERE id = $1
      FOR UPDATE`,
    [roleId],
  );
  if (!role.rows[0]) throw new AdminManagementNotFoundError();
  if (role.rows[0].systemKey !== null) {
    throw new AdminManagementConflictError(
      "System roles cannot be modified or deleted",
    );
  }
}

async function assertUserOperationAllowed({
  client,
  schema,
  actorUserId,
  targetUserId,
}: {
  client: PoolClient;
  schema: string;
  actorUserId: string;
  targetUserId: string;
}) {
  const actor = await client.query<{ kind: string }>(
    `SELECT kind FROM ${schema}.admin_principals
      WHERE user_id = $1 AND quarantined_at IS NULL`,
    [actorUserId],
  );
  if (!actor.rows[0]) {
    throw new AdminManagementConflictError(
      "The actor does not have active management access",
    );
  }

  const target = await client.query<{ principalKind: string | null }>(
    `SELECT principal.kind AS "principalKind"
       FROM "user" AS identity
       LEFT JOIN ${schema}.admin_principals AS principal
         ON principal.user_id = identity.id
      WHERE identity.id = $1
      FOR UPDATE OF identity`,
    [targetUserId],
  );
  if (!target.rows[0]) throw new AdminManagementNotFoundError();
  if (target.rows[0].principalKind === "super_admin") {
    throw new AdminManagementConflictError(
      "The super-admin cannot be changed through user operations",
    );
  }
  if (
    actor.rows[0].kind !== "super_admin" &&
    target.rows[0].principalKind !== null
  ) {
    throw new AdminManagementConflictError(
      "Delegated administrators cannot change management identities",
    );
  }
}

export async function createAdminRole(input: {
  actorUserId: string;
  name: string;
  description: string;
  permissions: AdminPermission[];
}) {
  const permissions = normalizeAdminPermissions(input.permissions);
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(
      `INSERT INTO ${schema}.admin_roles
        (name, description, permissions, created_by_user_id)
       VALUES ($1, $2, $3::jsonb, $4) RETURNING id::text`,
      [input.name.trim(), input.description.trim(), JSON.stringify(permissions), input.actorUserId],
    );
    const id = result.rows[0]!.id;
    await writeAdminAuditEventWithClient(client, {
      actorUserId: input.actorUserId,
      action: "role.create",
      targetType: "admin_role",
      targetId: id,
      outcome: "success",
      metadata: { permissionCount: permissions.length },
    });
    await client.query("COMMIT");
    return { id };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      throw new AdminManagementConflictError("A role with this name already exists");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAdminRole(input: {
  actorUserId: string;
  roleId: string;
  name: string;
  description: string;
  permissions: AdminPermission[];
}) {
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  const permissions = normalizeAdminPermissions(input.permissions);
  try {
    await client.query("BEGIN");
    await assertAdminRoleMutable(client, schema, input.roleId);
    const updated = await client.query(
      `UPDATE ${schema}.admin_roles
          SET name = $2, description = $3, permissions = $4::jsonb,
              updated_at = now()
        WHERE id = $1 RETURNING id`,
      [input.roleId, input.name.trim(), input.description.trim(), JSON.stringify(permissions)],
    );
    if (updated.rowCount !== 1) throw new AdminManagementNotFoundError();

    const affected = await client.query<{ userId: string }>(
      `UPDATE ${schema}.admin_assignments
          SET access_version = access_version + 1, updated_at = now()
        WHERE role_id = $1 RETURNING user_id AS "userId"`,
      [input.roleId],
    );
    if (affected.rows.length > 0) {
      const userIds = affected.rows.map((row) => row.userId);
      await client.query(
        `UPDATE ${schema}.admin_sessions SET revoked_at = now()
          WHERE user_id = ANY($1::text[]) AND revoked_at IS NULL`,
        [userIds],
      );
    }
    await writeAdminAuditEventWithClient(client, {
      actorUserId: input.actorUserId,
      action: "role.update",
      targetType: "admin_role",
      targetId: input.roleId,
      outcome: "success",
      metadata: { permissionCount: permissions.length, affectedAdmins: affected.rowCount },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      throw new AdminManagementConflictError("A role with this name already exists");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAdminRole(actorUserId: string, roleId: string) {
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await assertAdminRoleMutable(client, schema, roleId);
    const result = await client.query(
      `DELETE FROM ${schema}.admin_roles WHERE id = $1 RETURNING id`,
      [roleId],
    );
    if (result.rowCount !== 1) throw new AdminManagementNotFoundError();
    await writeAdminAuditEventWithClient(client, {
      actorUserId,
      action: "role.delete",
      targetType: "admin_role",
      targetId: roleId,
      outcome: "success",
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23503") {
      throw new AdminManagementConflictError(
        "Remove administrators from this role before deleting it",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function assignAdminRole(input: {
  actorUserId: string;
  userId: string;
  roleId: string;
}) {
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      `SELECT id FROM "user" WHERE id = $1 FOR UPDATE`,
      [input.userId],
    );
    if (user.rowCount !== 1) throw new AdminManagementNotFoundError();
    const superAdmin = await client.query(
      `SELECT 1 FROM ${schema}.admin_principals
        WHERE user_id = $1 AND kind = 'super_admin'`,
      [input.userId],
    );
    if (superAdmin.rowCount) {
      throw new AdminManagementConflictError("The super-admin cannot receive a delegated role");
    }
    const role = await client.query(
      `SELECT 1 FROM ${schema}.admin_roles WHERE id = $1`,
      [input.roleId],
    );
    if (role.rowCount !== 1) throw new AdminManagementNotFoundError();

    await client.query(
      `INSERT INTO ${schema}.admin_principals
        (user_id, kind, singleton_slot, quarantined_at, created_at, updated_at)
       VALUES ($1, 'delegated_admin', NULL, NULL, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET
         kind = 'delegated_admin', singleton_slot = NULL,
         quarantined_at = NULL, updated_at = now()
       WHERE ${schema}.admin_principals.kind <> 'super_admin'`,
      [input.userId],
    );
    await client.query(
      `INSERT INTO ${schema}.admin_assignments
        (user_id, role_id, assigned_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         role_id = EXCLUDED.role_id,
         assigned_by_user_id = EXCLUDED.assigned_by_user_id,
         access_version = ${schema}.admin_assignments.access_version + 1,
         updated_at = now()`,
      [input.userId, input.roleId, input.actorUserId],
    );
    await client.query(
      `UPDATE ${schema}.admin_sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [input.userId],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId: input.actorUserId,
      action: "administrator.assign_role",
      targetType: "user",
      targetId: input.userId,
      outcome: "success",
      metadata: { roleId: input.roleId },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function removeDelegatedAdmin(actorUserId: string, userId: string) {
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const principal = await client.query<{ kind: string }>(
      `SELECT kind FROM ${schema}.admin_principals WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    if (principal.rows[0]?.kind === "super_admin") {
      throw new AdminManagementConflictError("The super-admin cannot be removed");
    }
    await client.query(
      `DELETE FROM ${schema}.admin_assignments WHERE user_id = $1`,
      [userId],
    );
    await client.query(
      `DELETE FROM ${schema}.admin_principals
        WHERE user_id = $1 AND kind = 'delegated_admin'`,
      [userId],
    );
    await client.query(
      `UPDATE ${schema}.admin_sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId,
      action: "administrator.remove",
      targetType: "user",
      targetId: userId,
      outcome: "success",
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function suspendUser(input: {
  actorUserId: string;
  userId: string;
  reason: string;
  suspendedUntil?: Date | null;
}) {
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await assertUserOperationAllowed({
      client,
      schema,
      actorUserId: input.actorUserId,
      targetUserId: input.userId,
    });
    await client.query(
      `INSERT INTO ${schema}.account_restrictions
        (user_id, suspended_at, suspended_until, reason, actor_user_id, updated_at)
       VALUES ($1, now(), $2, $3, $4, now())
       ON CONFLICT (user_id) DO UPDATE SET
         suspended_at = now(), suspended_until = EXCLUDED.suspended_until,
         reason = EXCLUDED.reason, actor_user_id = EXCLUDED.actor_user_id,
         updated_at = now()`,
      [input.userId, input.suspendedUntil ?? null, input.reason.trim(), input.actorUserId],
    );
    await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [input.userId]);
    await client.query(
      `UPDATE ${schema}.admin_sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [input.userId],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId: input.actorUserId,
      action: "user.suspend",
      targetType: "user",
      targetId: input.userId,
      outcome: "success",
      metadata: { suspendedUntil: input.suspendedUntil?.toISOString() ?? null },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function restoreUser(actorUserId: string, userId: string) {
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await assertUserOperationAllowed({
      client,
      schema,
      actorUserId,
      targetUserId: userId,
    });
    await client.query(
      `DELETE FROM ${schema}.account_restrictions WHERE user_id = $1`,
      [userId],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId,
      action: "user.restore",
      targetType: "user",
      targetId: userId,
      outcome: "success",
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeUserSessions(actorUserId: string, userId: string) {
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await assertUserOperationAllowed({
      client,
      schema,
      actorUserId,
      targetUserId: userId,
    });
    await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [userId]);
    await client.query(
      `UPDATE ${schema}.admin_sessions SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId,
      action: "user.sessions.revoke",
      targetType: "user",
      targetId: userId,
      outcome: "success",
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function adminUnpublishResume(input: {
  actorUserId: string;
  userId: string;
  resumeId: string;
  reason: string;
}) {
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE ${schema}.resumes
          SET published = false, updated_at = now()
        WHERE user_id = $1 AND id = $2 AND published = true
        RETURNING id`,
      [input.userId, input.resumeId],
    );
    if (result.rowCount !== 1) throw new AdminManagementNotFoundError();
    await writeAdminAuditEventWithClient(client, {
      actorUserId: input.actorUserId,
      action: "resume.unpublish",
      targetType: "resume",
      targetId: input.resumeId,
      outcome: "success",
      metadata: { ownerUserId: input.userId, reason: input.reason.trim() },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function adminCancelExport(actorUserId: string, jobId: string) {
  await adminCancelPdfExport(jobId);
  await writeAdminAuditEvent({
    actorUserId,
    action: "export.cancel",
    targetType: "pdf_export",
    targetId: jobId,
    outcome: "success",
  });
}

export async function adminRetryExport(actorUserId: string, jobId: string) {
  const retried = await adminRetryPdfExport(jobId);
  await writeAdminAuditEvent({
    actorUserId,
    action: "export.retry",
    targetType: "pdf_export",
    targetId: jobId,
    outcome: "success",
    metadata: { retriedJobId: retried.jobId },
  });
  return retried;
}
