import { randomBytes, randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";

import { hashAdminSecret } from "@/lib/admin/crypto";
import {
  createAdminAuditChanges,
  writeAdminAuditEventWithClient,
} from "@/lib/admin/audit";
import { getDatabasePool } from "@/lib/runtime/database";
import { sendUserInvitationEmail } from "@/lib/runtime/email";
import { resolveApplicationOriginForBootstrap } from "@/lib/runtime/configuration";

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

export class AdminInvitationConflictError extends Error {}
export class AdminInvitationNotFoundError extends Error {}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function createInvitationUrl(rawToken: string) {
  const url = new URL(
    "/activate",
    resolveApplicationOriginForBootstrap(),
  );
  url.searchParams.set("token", rawToken);
  return url.toString();
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
  if (input.actorKind !== "super_admin" || roleIds.length === 0) {
    throw new AdminInvitationConflictError(
      "Only the super-admin can invite an administrator with assigned roles",
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

    const userId = randomUUID();
    const rawToken = randomBytes(32).toString("base64url");
    await client.query(
      `INSERT INTO "user"
        (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, false, NULL, now(), now())`,
      [userId, name, email],
    );
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
    await client.query(
      `INSERT INTO ${schema}.admin_activation_tokens
        (user_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [
        userId,
        "delegated_admin",
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
        grantsManagementAccess: true,
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

    await (input.deliverInvitation ?? sendUserInvitationEmail)({
      email,
      name,
      url: createInvitationUrl(rawToken),
      grantsManagementAccess: true,
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

export async function resendUserInvitation(input: {
  actorUserId: string;
  actorKind: "super_admin" | "delegated_admin";
  userId: string;
  deliverInvitation?: typeof sendUserInvitationEmail;
}) {
  if (input.actorKind !== "super_admin") {
    throw new AdminInvitationConflictError(
      "Only the super-admin can resend an administrator invitation",
    );
  }
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('admin-invite-user:' || $1))",
      [input.userId],
    );
    const invitationResult = await client.query<{ purpose: "delegated_admin" }>(
      `SELECT purpose
         FROM ${schema}.admin_activation_tokens
        WHERE user_id = $1
          AND purpose = 'delegated_admin'
        ORDER BY created_at DESC, id DESC
        FOR UPDATE`,
      [input.userId],
    );
    const purpose = invitationResult.rows[0]?.purpose ?? null;
    const targetResult = await client.query<{
      email: string;
      emailVerified: boolean;
      hasCredential: boolean;
      name: string;
      principalKind: "super_admin" | "delegated_admin" | null;
    }>(
      `SELECT identity.name, identity.email,
              identity."emailVerified" AS "emailVerified",
              principal.kind AS "principalKind",
              EXISTS (
                SELECT 1 FROM "account"
                 WHERE "userId" = identity.id AND "providerId" = 'credential'
              ) AS "hasCredential"
         FROM "user" AS identity
         LEFT JOIN ${schema}.admin_principals AS principal
           ON principal.user_id = identity.id AND principal.quarantined_at IS NULL
        WHERE identity.id = $1
        FOR UPDATE OF identity`,
      [input.userId],
    );
    const target = targetResult.rows[0];
    if (!target) throw new AdminInvitationNotFoundError();

    if (
      target.emailVerified ||
      target.hasCredential ||
      purpose !== "delegated_admin" ||
      target.principalKind !== "delegated_admin"
    ) {
      throw new AdminInvitationConflictError(
        "The account does not have a resendable invitation",
      );
    }

    const rawToken = randomBytes(32).toString("base64url");
    await client.query(
      `UPDATE ${schema}.admin_activation_tokens
          SET consumed_at = now()
        WHERE user_id = $1
          AND purpose = 'delegated_admin'
          AND consumed_at IS NULL`,
      [input.userId],
    );
    await client.query(
      `INSERT INTO ${schema}.admin_activation_tokens
        (user_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [
        input.userId,
        "delegated_admin",
        hashAdminSecret(rawToken),
        new Date(Date.now() + INVITATION_TTL_MS),
      ],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId: input.actorUserId,
      action: "user.invite.resend",
      targetType: "user",
      targetId: input.userId,
      outcome: "success",
      metadata: {
        grantsManagementAccess: true,
        targetSnapshot: {
          label: target.name,
          description: target.email,
        },
      },
    });
    await (input.deliverInvitation ?? sendUserInvitationEmail)({
      email: target.email,
      name: target.name,
      url: createInvitationUrl(rawToken),
      grantsManagementAccess: true,
    });
    await client.query("COMMIT");
    return { userId: input.userId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
