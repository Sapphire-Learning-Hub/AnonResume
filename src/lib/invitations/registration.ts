import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import {
  lockInvitationEmail,
  normalizeInvitationEmail,
} from "@/lib/invitations/store";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

const schema = quoteIdentifier(getDatabaseSchemaName());

export async function invalidateInvitationsForIndependentRegistrationInTransaction(
  client: PoolClient,
  email: string,
  userId: string,
  now = new Date(),
) {
  if (!userId) return;
  const invitedEmail = normalizeInvitationEmail(email);
  await lockInvitationEmail(client, invitedEmail);
  await client.query(
    `UPDATE ${schema}.user_invitations
        SET invalidated_at = $2,
            invalidation_reason = 'registered_independently',
            token_hash = NULL,
            updated_at = $2
      WHERE invited_email = $1
        AND accepted_at IS NULL AND revoked_at IS NULL AND invalidated_at IS NULL`,
    [invitedEmail, now],
  );
}

export async function invalidateInvitationsForIndependentRegistration(
  email: string,
  userId: string,
) {
  if (!userId) return;
  const invitedEmail = normalizeInvitationEmail(email);
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await invalidateInvitationsForIndependentRegistrationInTransaction(
      client,
      invitedEmail,
      userId,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
