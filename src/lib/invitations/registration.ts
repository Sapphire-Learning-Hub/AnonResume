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

export async function invalidateInvitationsForIndependentRegistration(
  email: string,
  userId: string,
) {
  if (!userId) return;
  const invitedEmail = normalizeInvitationEmail(email);
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await lockInvitationEmail(client, invitedEmail);
    await client.query(
      `UPDATE ${schema}.user_invitations
          SET invalidated_at = now(),
              invalidation_reason = 'registered_independently',
              token_hash = NULL,
              updated_at = now()
        WHERE invited_email = $1
          AND accepted_at IS NULL AND revoked_at IS NULL AND invalidated_at IS NULL`,
      [invitedEmail],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
