import { randomBytes, randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";
import { startAdminActivation } from "@/lib/admin/activation";
import { hashAdminSecret } from "@/lib/admin/crypto";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("legacy product invitation activation", () => {
  const schema = quoteIdentifier(getDatabaseSchemaName());

  it("synchronizes a migrated invitation when the old activation link completes", async () => {
    const inviterId = `legacy-inviter-${randomUUID()}`;
    const invitedUserId = `legacy-invited-${randomUUID()}`;
    const email = `${invitedUserId}@example.com`;
    const token = randomBytes(32).toString("base64url");
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Inviter', $2, true, now(), now()), ($3, 'Invited', $4, false, now(), now())`,
      [inviterId, `${inviterId}@example.com`, invitedUserId, email],
    );
    await getDatabasePool().query(
      `INSERT INTO ${schema}.admin_activation_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'product_user', $2, now() + interval '1 day')`,
      [invitedUserId, hashAdminSecret(token)],
    );
    const invitation = await getDatabasePool().query<{ id: string }>(
      `INSERT INTO ${schema}.user_invitations
        (inviter_user_id, invited_email, token_hash, last_sent_at, expires_at, legacy_invited_user_id)
       VALUES ($1, $2, $3, now(), now() + interval '1 day', $4)
       RETURNING id`,
      [inviterId, email, hashAdminSecret(token), invitedUserId],
    );
    try {
      await startAdminActivation({ token, password: "legacy-user-password", deviceName: "unused" });

      const result = await getDatabasePool().query<{
        acceptedByUserId: string | null;
        acceptedAt: Date | null;
        tokenHash: string | null;
      }>(
        `SELECT accepted_by_user_id AS "acceptedByUserId", accepted_at AS "acceptedAt", token_hash AS "tokenHash"
           FROM ${schema}.user_invitations WHERE id = $1`,
        [invitation.rows[0]!.id],
      );
      expect(result.rows[0]).toMatchObject({
        acceptedByUserId: invitedUserId,
        acceptedAt: expect.any(Date),
        tokenHash: null,
      });
    } finally {
      await getDatabasePool().query(`DELETE FROM "account" WHERE "userId" = $1`, [invitedUserId]);
      await getDatabasePool().query(`DELETE FROM ${schema}.user_invitations WHERE legacy_invited_user_id = $1`, [invitedUserId]);
      await getDatabasePool().query(`DELETE FROM ${schema}.admin_activation_tokens WHERE user_id = $1`, [invitedUserId]);
      await getDatabasePool().query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [[inviterId, invitedUserId]]);
    }
  });
});
