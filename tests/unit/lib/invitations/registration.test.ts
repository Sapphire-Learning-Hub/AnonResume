import { randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";
import { invalidateInvitationsForIndependentRegistration } from "@/lib/invitations/registration";
import { createUserInvitation } from "@/lib/invitations/service";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("independent registration invitation coordination", () => {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const inviters = [`registration-a-${randomUUID()}`, `registration-b-${randomUUID()}`];

  beforeAll(async () => {
    for (const inviter of inviters) {
      await getDatabasePool().query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $1, $2, true, now(), now())`,
        [inviter, `${inviter}@example.com`],
      );
    }
  });

  afterEach(async () => {
    await getDatabasePool().query(`DELETE FROM ${schema}.user_invitations WHERE inviter_user_id = ANY($1::text[])`, [inviters]);
  });

  afterAll(async () => {
    await getDatabasePool().query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [inviters]);
  });

  it("marks every invitation for the email independently registered", async () => {
    const email = `independent-${randomUUID()}@example.com`;
    for (const inviter of inviters) {
      await createUserInvitation({
        inviterUserId: inviter,
        inviterName: inviter,
        inviterEmail: `${inviter}@example.com`,
        invitedEmail: email,
        deliverInvitation: async () => undefined,
      });
    }

    await invalidateInvitationsForIndependentRegistration(email, `new-user-${randomUUID()}`);

    const result = await getDatabasePool().query<{ reason: string; tokenHash: string | null }>(
      `SELECT invalidation_reason AS reason, token_hash AS "tokenHash"
         FROM ${schema}.user_invitations WHERE invited_email = $1`,
      [email],
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows).toEqual(
      expect.arrayContaining([
        { reason: "registered_independently", tokenHash: null },
        { reason: "registered_independently", tokenHash: null },
      ]),
    );
  });
});
