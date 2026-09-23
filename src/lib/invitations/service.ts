import {
  INVITATION_RESEND_INTERVAL_MS,
  INVITATION_TTL_MS,
  MAX_ACTIVE_INVITATIONS,
} from "@/lib/invitations/constants";
import {
  InvitationEmailError,
  InvitationLimitError,
  InvitationNotActionableError,
  InvitationResendTooSoonError,
} from "@/lib/invitations/errors";
import {
  createInvitationToken,
  createInvitationUrl,
  isInvitationTerminal,
  lockInvitationScope,
  normalizeInvitationEmail,
  toInvitationSummary,
  type InvitationRow,
} from "@/lib/invitations/store";
import type {
  InvitationCreateResult,
  ProductInvitationDelivery,
} from "@/lib/invitations/types";
import { getDatabasePool } from "@/lib/runtime/database";
import { getDatabaseSchemaName } from "@/db";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

const schema = quoteIdentifier(getDatabaseSchemaName());

async function missingDelivery() {
  throw new Error("Product invitation delivery is not configured");
}

export async function listUserInvitations(inviterUserId: string) {
  const now = new Date();
  const result = await getDatabasePool().query<InvitationRow>(
    `SELECT
       id,
       inviter_user_id AS "inviterUserId",
       invited_email AS "invitedEmail",
       token_hash AS "tokenHash",
       last_sent_at AS "lastSentAt",
       expires_at AS "expiresAt",
       accepted_by_user_id AS "acceptedByUserId",
       accepted_at AS "acceptedAt",
       revoked_at AS "revokedAt",
       invalidated_at AS "invalidatedAt",
       invalidation_reason AS "invalidationReason",
       legacy_invited_user_id AS "legacyInvitedUserId",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM ${schema}.user_invitations
     WHERE inviter_user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [inviterUserId],
  );
  const items = result.rows.map((row) => toInvitationSummary(row, now));
  return {
    activeCount: items.filter((item) => item.status === "pending").length,
    limit: MAX_ACTIVE_INVITATIONS,
    items,
  };
}

export async function createUserInvitation(input: {
  inviterUserId: string;
  inviterName: string;
  inviterEmail: string;
  invitedEmail: string;
  now?: Date;
  deliverInvitation?: ProductInvitationDelivery;
}): Promise<InvitationCreateResult> {
  const now = input.now ?? new Date();
  const invitedEmail = normalizeInvitationEmail(input.invitedEmail);
  const inviterEmail = normalizeInvitationEmail(input.inviterEmail);
  if (invitedEmail === inviterEmail) {
    throw new InvitationEmailError("An account cannot invite itself");
  }
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await lockInvitationScope(client, input.inviterUserId, invitedEmail);
    const existingUser = await client.query(
      `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
      [invitedEmail],
    );
    if (existingUser.rowCount) {
      await client.query("COMMIT");
      return { outcome: "handled" };
    }
    const duplicate = await client.query(
      `SELECT id FROM ${schema}.user_invitations
       WHERE inviter_user_id = $1 AND invited_email = $2
         AND accepted_at IS NULL AND revoked_at IS NULL AND invalidated_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [input.inviterUserId, invitedEmail],
    );
    if (duplicate.rowCount) {
      await client.query("COMMIT");
      return { outcome: "handled" };
    }
    const active = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${schema}.user_invitations
       WHERE inviter_user_id = $1
         AND accepted_at IS NULL AND revoked_at IS NULL AND invalidated_at IS NULL
         AND expires_at > $2`,
      [input.inviterUserId, now],
    );
    if (Number(active.rows[0]?.count ?? 0) >= MAX_ACTIVE_INVITATIONS) {
      throw new InvitationLimitError();
    }
    const { rawToken, tokenHash } = createInvitationToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const inserted = await client.query<InvitationRow>(
      `INSERT INTO ${schema}.user_invitations
         (inviter_user_id, invited_email, token_hash, last_sent_at, expires_at,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $4, $4)
       RETURNING
         id,
         inviter_user_id AS "inviterUserId",
         invited_email AS "invitedEmail",
         token_hash AS "tokenHash",
         last_sent_at AS "lastSentAt",
         expires_at AS "expiresAt",
         accepted_by_user_id AS "acceptedByUserId",
         accepted_at AS "acceptedAt",
         revoked_at AS "revokedAt",
         invalidated_at AS "invalidatedAt",
         invalidation_reason AS "invalidationReason",
         legacy_invited_user_id AS "legacyInvitedUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [input.inviterUserId, invitedEmail, tokenHash, now, expiresAt],
    );
    await (input.deliverInvitation ?? missingDelivery)({
      email: invitedEmail,
      inviterName: input.inviterName.trim(),
      replacesPreviousLink: false,
      url: createInvitationUrl(rawToken),
    });
    await client.query("COMMIT");
    return {
      outcome: "sent",
      invitation: toInvitationSummary(inserted.rows[0]!, now),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function resendUserInvitation(input: {
  inviterUserId: string;
  invitationId: string;
  inviterName: string;
  now?: Date;
  deliverInvitation?: ProductInvitationDelivery;
}): Promise<InvitationCreateResult> {
  const now = input.now ?? new Date();
  const candidate = await getDatabasePool().query<{ invitedEmail: string }>(
    `SELECT invited_email AS "invitedEmail"
       FROM ${schema}.user_invitations
      WHERE id = $1 AND inviter_user_id = $2`,
    [input.invitationId, input.inviterUserId],
  );
  const invitedEmail = candidate.rows[0]?.invitedEmail;
  if (!invitedEmail) throw new InvitationNotActionableError();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await lockInvitationScope(client, input.inviterUserId, invitedEmail);
    const result = await client.query<InvitationRow>(
      `SELECT
         id,
         inviter_user_id AS "inviterUserId",
         invited_email AS "invitedEmail",
         token_hash AS "tokenHash",
         last_sent_at AS "lastSentAt",
         expires_at AS "expiresAt",
         accepted_by_user_id AS "acceptedByUserId",
         accepted_at AS "acceptedAt",
         revoked_at AS "revokedAt",
         invalidated_at AS "invalidatedAt",
         invalidation_reason AS "invalidationReason",
         legacy_invited_user_id AS "legacyInvitedUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM ${schema}.user_invitations
       WHERE id = $1 AND inviter_user_id = $2
       FOR UPDATE`,
      [input.invitationId, input.inviterUserId],
    );
    const invitation = result.rows[0];
    if (!invitation || isInvitationTerminal(invitation)) {
      throw new InvitationNotActionableError();
    }
    const nextAllowedAt = new Date(
      invitation.lastSentAt.getTime() + INVITATION_RESEND_INTERVAL_MS,
    );
    if (now.getTime() < nextAllowedAt.getTime()) {
      throw new InvitationResendTooSoonError(nextAllowedAt);
    }
    const existingUser = await client.query(
      `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
      [invitedEmail],
    );
    if (existingUser.rowCount) {
      await client.query(
        `UPDATE ${schema}.user_invitations
            SET invalidated_at = $2,
                invalidation_reason = 'registered_independently',
                token_hash = NULL,
                updated_at = $2
          WHERE id = $1`,
        [invitation.id, now],
      );
      await client.query("COMMIT");
      return { outcome: "handled" };
    }
    if (invitation.expiresAt.getTime() <= now.getTime()) {
      const active = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${schema}.user_invitations
         WHERE inviter_user_id = $1 AND id <> $2
           AND accepted_at IS NULL AND revoked_at IS NULL AND invalidated_at IS NULL
           AND expires_at > $3`,
        [input.inviterUserId, invitation.id, now],
      );
      if (Number(active.rows[0]?.count ?? 0) >= MAX_ACTIVE_INVITATIONS) {
        throw new InvitationLimitError();
      }
    }
    const { rawToken, tokenHash } = createInvitationToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const updated = await client.query<InvitationRow>(
      `UPDATE ${schema}.user_invitations
          SET token_hash = $2, last_sent_at = $3, expires_at = $4, updated_at = $3
        WHERE id = $1
        RETURNING
          id,
          inviter_user_id AS "inviterUserId",
          invited_email AS "invitedEmail",
          token_hash AS "tokenHash",
          last_sent_at AS "lastSentAt",
          expires_at AS "expiresAt",
          accepted_by_user_id AS "acceptedByUserId",
          accepted_at AS "acceptedAt",
          revoked_at AS "revokedAt",
          invalidated_at AS "invalidatedAt",
          invalidation_reason AS "invalidationReason",
          legacy_invited_user_id AS "legacyInvitedUserId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
      [invitation.id, tokenHash, now, expiresAt],
    );
    if (invitation.legacyInvitedUserId) {
      await client.query(
        `UPDATE ${schema}.admin_activation_tokens
            SET consumed_at = COALESCE(consumed_at, $2)
          WHERE user_id = $1 AND purpose = 'product_user'`,
        [invitation.legacyInvitedUserId, now],
      );
    }
    await (input.deliverInvitation ?? missingDelivery)({
      email: invitedEmail,
      inviterName: input.inviterName.trim(),
      replacesPreviousLink: true,
      url: createInvitationUrl(rawToken),
    });
    await client.query("COMMIT");
    return {
      outcome: "sent",
      invitation: toInvitationSummary(updated.rows[0]!, now),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeUserInvitation(input: {
  inviterUserId: string;
  invitationId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const candidate = await getDatabasePool().query<{
    invitedEmail: string;
    legacyInvitedUserId: string | null;
  }>(
    `SELECT invited_email AS "invitedEmail",
            legacy_invited_user_id AS "legacyInvitedUserId"
       FROM ${schema}.user_invitations
      WHERE id = $1 AND inviter_user_id = $2`,
    [input.invitationId, input.inviterUserId],
  );
  const invitation = candidate.rows[0];
  if (!invitation) throw new InvitationNotActionableError();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await lockInvitationScope(
      client,
      input.inviterUserId,
      invitation.invitedEmail,
    );
    const revoked = await client.query<{ legacyInvitedUserId: string | null }>(
      `UPDATE ${schema}.user_invitations
          SET revoked_at = $3, token_hash = NULL, updated_at = $3
        WHERE id = $1 AND inviter_user_id = $2
          AND accepted_at IS NULL AND revoked_at IS NULL AND invalidated_at IS NULL
        RETURNING legacy_invited_user_id AS "legacyInvitedUserId"`,
      [input.invitationId, input.inviterUserId, now],
    );
    if (revoked.rowCount !== 1) throw new InvitationNotActionableError();
    if (revoked.rows[0]?.legacyInvitedUserId) {
      await client.query(
        `UPDATE ${schema}.admin_activation_tokens
            SET consumed_at = COALESCE(consumed_at, $2)
          WHERE user_id = $1 AND purpose = 'product_user'`,
        [revoked.rows[0].legacyInvitedUserId, now],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
