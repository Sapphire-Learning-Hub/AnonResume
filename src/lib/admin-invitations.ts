import { randomBytes, randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";

import { hashAdminSecret } from "./admin-crypto";
import {
  createAdminAuditChanges,
  writeAdminAuditEventWithClient,
} from "./admin-audit";
import { getDatabasePool } from "./database";
import { sendUserInvitationEmail } from "./email";
import { resolveApplicationOriginForBootstrap } from "./runtime-configuration";

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

export class AdminInvitationConflictError extends Error {}
export class AdminInvitationNotFoundError extends Error {}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function inviteUser(input: {
  actorUserId: string;
  actorKind: "super_admin" | "delegated_admin";
  name: string;
  email: string;
  roleIds?: string[];
  deliverInvitation?: typeof sendUserInvitationEmail;
}) {
  const roleIds = [...new Set(input.roleIds ?? [])].sort();
  if (roleIds.length > 0 && input.actorKind !== "super_admin") {
    throw new AdminInvitationConflictError(
      "Only the super-admin can invite a delegated administrator",
    );
  }

  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  let roleSnapshots: Array<{
    description: string;
    id: string;
    name: string;
  }> = [];
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('admin-invite:' || $1))",
      [email],
    );
    const existing = await client.query(
      `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    if (existing.rowCount) {
      throw new AdminInvitationConflictError("An account with this email already exists");
    }
    if (roleIds.length > 0) {
      const roles = await client.query<{
        description: string;
        id: string;
        name: string;
      }>(
        `SELECT id::text, name, description
           FROM ${schema}.admin_roles WHERE id = ANY($1::uuid[])`,
        [roleIds],
      );
      if (roles.rowCount !== roleIds.length) {
        throw new AdminInvitationNotFoundError();
      }
      roleSnapshots = roles.rows;
    }

    const userId = randomUUID();
    const rawToken = randomBytes(32).toString("base64url");
    const purpose = roleIds.length > 0 ? "delegated_admin" : "product_user";
    await client.query(
      `INSERT INTO "user"
        (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, false, NULL, now(), now())`,
      [userId, name, email],
    );
    if (roleIds.length > 0) {
      await client.query(
        `INSERT INTO ${schema}.admin_principals (user_id, kind)
         VALUES ($1, 'delegated_admin')`,
        [userId],
      );
      await client.query(
        `INSERT INTO ${schema}.admin_assignments
          (user_id, role_id, assigned_by_user_id)
         SELECT $1, role_id, $3
           FROM unnest($2::uuid[]) AS role_id`,
        [userId, roleIds, input.actorUserId],
      );
    }
    await client.query(
      `INSERT INTO ${schema}.admin_activation_tokens
        (user_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [
        userId,
        purpose,
        hashAdminSecret(rawToken),
        new Date(Date.now() + INVITATION_TTL_MS),
      ],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId: input.actorUserId,
      action: "user.invite",
      targetType: "user",
      targetId: userId,
      outcome: "success",
      metadata: {
        changes: createAdminAuditChanges(
          { status: null, roleIds: [] },
          { status: "invited", roleIds },
        ),
        grantsManagementAccess: roleIds.length > 0,
        resources: roleSnapshots.map((role) => ({
          type: "admin_role",
          id: role.id,
          label: role.name,
          description: role.description,
        })),
        roleIds,
        targetSnapshot: { label: name, description: email },
      },
    });

    const url = new URL(
      "/activate",
      resolveApplicationOriginForBootstrap(process.env),
    );
    url.searchParams.set("token", rawToken);
    await (input.deliverInvitation ?? sendUserInvitationEmail)({
      email,
      name,
      url: url.toString(),
      grantsManagementAccess: roleIds.length > 0,
    });
    await client.query("COMMIT");
    return { userId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      throw new AdminInvitationConflictError("The invitation conflicts with an existing account");
    }
    throw error;
  } finally {
    client.release();
  }
}
