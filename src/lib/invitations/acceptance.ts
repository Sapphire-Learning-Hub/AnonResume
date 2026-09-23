import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { getDatabaseSchemaName } from "@/db";
import { hashAdminSecret } from "@/lib/admin/crypto";
import { lockInvitationScope } from "@/lib/invitations/store";
import { getDatabasePool } from "@/lib/runtime/database";

export class InvalidUserInvitationError extends Error {
  constructor() {
    super("The invitation is invalid or expired");
    this.name = "InvalidUserInvitationError";
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

const schema = quoteIdentifier(getDatabaseSchemaName());

export async function inspectUserInvitation(rawToken: string) {
  if (!rawToken) throw new InvalidUserInvitationError();
  const result = await getDatabasePool().query<{ email: string }>(
    `SELECT invited_email AS email
       FROM ${schema}.user_invitations
      WHERE token_hash = $1
        AND accepted_at IS NULL
        AND revoked_at IS NULL
        AND invalidated_at IS NULL
        AND expires_at > now()
      LIMIT 1`,
    [hashAdminSecret(rawToken)],
  );
  const invitation = result.rows[0];
  if (!invitation) throw new InvalidUserInvitationError();
  return invitation;
}

export async function acceptUserInvitation(input: {
  token: string;
  name: string;
  password: string;
  now?: Date;
}) {
  if (!input.token || input.name.trim().length < 1 || input.name.trim().length > 80) {
    throw new InvalidUserInvitationError();
  }
  if (input.password.length < 12 || input.password.length > 128) {
    throw new InvalidUserInvitationError();
  }
  const now = input.now ?? new Date();
  const tokenHash = hashAdminSecret(input.token);
  const candidate = await getDatabasePool().query<{
    id: string;
    inviterUserId: string;
    invitedEmail: string;
    legacyInvitedUserId: string | null;
  }>(
    `SELECT id, inviter_user_id AS "inviterUserId",
            invited_email AS "invitedEmail",
            legacy_invited_user_id AS "legacyInvitedUserId"
       FROM ${schema}.user_invitations WHERE token_hash = $1 LIMIT 1`,
    [tokenHash],
  );
  const invitationCandidate = candidate.rows[0];
  if (!invitationCandidate) throw new InvalidUserInvitationError();

  const passwordHash = await hashPassword(input.password);
  const client = await getDatabasePool().connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    await lockInvitationScope(
      client,
      invitationCandidate.inviterUserId,
      invitationCandidate.invitedEmail,
    );
    const locked = await client.query<{ id: string }>(
      `SELECT id FROM ${schema}.user_invitations
        WHERE id = $1 AND token_hash = $2
          AND accepted_at IS NULL AND revoked_at IS NULL AND invalidated_at IS NULL
          AND expires_at > $3
        FOR UPDATE`,
      [invitationCandidate.id, tokenHash, now],
    );
    if (locked.rowCount !== 1) throw new InvalidUserInvitationError();
    const existing = await client.query<{
      emailVerified: boolean;
      hasCredential: boolean;
      id: string;
    }>(
      `SELECT identity.id,
              identity."emailVerified" AS "emailVerified",
              EXISTS (
                SELECT 1 FROM "account"
                 WHERE "userId" = identity.id AND "providerId" = 'credential'
              ) AS "hasCredential"
         FROM "user" AS identity
        WHERE lower(identity.email) = $1
        LIMIT 1`,
      [invitationCandidate.invitedEmail],
    );
    const existingIdentity = existing.rows[0];
    const isLegacyPlaceholder = Boolean(
      existingIdentity &&
      invitationCandidate.legacyInvitedUserId === existingIdentity.id &&
      !existingIdentity.emailVerified &&
      !existingIdentity.hasCredential,
    );
    if (existingIdentity && !isLegacyPlaceholder) {
      await client.query(
        `UPDATE ${schema}.user_invitations
            SET invalidated_at = $2,
                invalidation_reason = 'registered_independently',
                token_hash = NULL,
                updated_at = $2
          WHERE invited_email = $1
            AND accepted_at IS NULL AND revoked_at IS NULL AND invalidated_at IS NULL`,
        [invitationCandidate.invitedEmail, now],
      );
      await client.query("COMMIT");
      committed = true;
      throw new InvalidUserInvitationError();
    }

    const userId = existingIdentity?.id ?? randomUUID();
    if (isLegacyPlaceholder) {
      await client.query(
        `UPDATE "user"
            SET name = $2, "emailVerified" = true, "updatedAt" = $3
          WHERE id = $1`,
        [userId, input.name.trim(), now],
      );
    } else {
      await client.query(
        `INSERT INTO "user"
          (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, NULL, $4, $4)`,
        [userId, input.name.trim(), invitationCandidate.invitedEmail, now],
      );
    }
    await client.query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'credential', $2, $3, $4, $4, 'local:credential')`,
      [randomUUID(), userId, passwordHash, now],
    );
    await client.query(
      `UPDATE ${schema}.user_invitations
          SET accepted_by_user_id = $2,
              accepted_at = $3,
              token_hash = NULL,
              updated_at = $3
        WHERE id = $1`,
      [invitationCandidate.id, userId, now],
    );
    await client.query(
      `UPDATE ${schema}.user_invitations
          SET invalidated_at = $3,
              invalidation_reason = 'accepted_via_other_invitation',
              token_hash = NULL,
              updated_at = $3
        WHERE invited_email = $1 AND id <> $2
          AND accepted_at IS NULL AND revoked_at IS NULL AND invalidated_at IS NULL`,
      [invitationCandidate.invitedEmail, invitationCandidate.id, now],
    );
    await client.query("COMMIT");
    committed = true;
    return { email: invitationCandidate.invitedEmail, userId };
  } catch (error) {
    if (!committed) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    if ((error as { code?: string }).code === "23505") {
      throw new InvalidUserInvitationError();
    }
    throw error;
  } finally {
    client.release();
  }
}
