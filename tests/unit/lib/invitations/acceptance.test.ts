import { randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";
import {
  acceptUserInvitation,
  inspectUserInvitation,
  InvalidUserInvitationError,
} from "@/lib/invitations/acceptance";
import { createUserInvitation } from "@/lib/invitations/service";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("product invitation acceptance", () => {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const inviterA = `accept-inviter-a-${randomUUID()}`;
  const inviterB = `accept-inviter-b-${randomUUID()}`;
  const createdUserIds = [inviterA, inviterB];

  beforeAll(async () => {
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Inviter A', $2, true, now(), now()),
              ($3, 'Inviter B', $4, true, now(), now())`,
      [inviterA, `${inviterA}@example.com`, inviterB, `${inviterB}@example.com`],
    );
  });

  afterEach(async () => {
    await getDatabasePool().query(
      `DELETE FROM ${schema}.user_invitations
        WHERE inviter_user_id = ANY($1::text[])`,
      [[inviterA, inviterB]],
    );
    if (createdUserIds.length > 2) {
      const ids = createdUserIds.splice(2);
      await getDatabasePool().query(`DELETE FROM "account" WHERE "userId" = ANY($1::text[])`, [ids]);
      await getDatabasePool().query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [ids]);
    }
  });

  afterAll(async () => {
    await getDatabasePool().query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [[inviterA, inviterB]]);
  });

  async function invitation(inviterUserId = inviterA, email = `accepted-${randomUUID()}@example.com`) {
    let token = "";
    const result = await createUserInvitation({
      inviterUserId,
      inviterName: inviterUserId === inviterA ? "Inviter A" : "Inviter B",
      inviterEmail: `${inviterUserId}@example.com`,
      invitedEmail: email,
      deliverInvitation: async ({ url }) => {
        token = new URL(url).searchParams.get("token") ?? "";
      },
    });
    if (result.outcome !== "sent" || !token) throw new Error("Expected invitation token");
    return { email, id: result.invitation.id, token };
  }

  it("creates and verifies an account only from a valid unexpired token", async () => {
    const pending = await invitation();
    await expect(inspectUserInvitation(pending.token)).resolves.toEqual({
      email: pending.email,
    });

    const accepted = await acceptUserInvitation({
      token: pending.token,
      name: "Accepted user",
      password: "accepted-user-password",
    });
    createdUserIds.push(accepted.userId);

    const identity = await getDatabasePool().query<{
      email: string;
      emailVerified: boolean;
      hasCredential: boolean;
    }>(
      `SELECT identity.email, identity."emailVerified" AS "emailVerified",
              EXISTS (SELECT 1 FROM "account" WHERE "userId" = identity.id AND "providerId" = 'credential') AS "hasCredential"
         FROM "user" AS identity WHERE identity.id = $1`,
      [accepted.userId],
    );
    expect(identity.rows[0]).toEqual({
      email: pending.email,
      emailVerified: true,
      hasCredential: true,
    });
    await expect(inspectUserInvitation(pending.token)).rejects.toBeInstanceOf(
      InvalidUserInvitationError,
    );
  });

  it("attributes acceptance to the used link and invalidates competing links", async () => {
    const email = `competing-${randomUUID()}@example.com`;
    const first = await invitation(inviterA, email);
    const second = await invitation(inviterB, email);

    const accepted = await acceptUserInvitation({
      token: second.token,
      name: "Linked user",
      password: "linked-user-password",
    });
    createdUserIds.push(accepted.userId);

    const rows = await getDatabasePool().query<{
      id: string;
      acceptedByUserId: string | null;
      invalidationReason: string | null;
      tokenHash: string | null;
    }>(
      `SELECT id, accepted_by_user_id AS "acceptedByUserId",
              invalidation_reason AS "invalidationReason", token_hash AS "tokenHash"
         FROM ${schema}.user_invitations WHERE id = ANY($1::uuid[])`,
      [[first.id, second.id]],
    );
    expect(rows.rows.find((row) => row.id === second.id)).toMatchObject({
      acceptedByUserId: accepted.userId,
      invalidationReason: null,
      tokenHash: null,
    });
    expect(rows.rows.find((row) => row.id === first.id)).toMatchObject({
      acceptedByUserId: null,
      invalidationReason: "accepted_via_other_invitation",
      tokenHash: null,
    });
  });

  it("allows only one winner when the same token is submitted concurrently", async () => {
    const pending = await invitation();
    const results = await Promise.allSettled([
      acceptUserInvitation({ token: pending.token, name: "First", password: "first-user-password" }),
      acceptUserInvitation({ token: pending.token, name: "Second", password: "second-user-password" }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (fulfilled[0]?.status === "fulfilled") createdUserIds.push(fulfilled[0].value.userId);
    expect(rejected[0]).toMatchObject({ reason: expect.any(InvalidUserInvitationError) });
  });

  it("rejects an expired link without creating an account", async () => {
    const pending = await invitation();
    await getDatabasePool().query(
      `UPDATE ${schema}.user_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [pending.id],
    );

    await expect(
      acceptUserInvitation({ token: pending.token, name: "Expired", password: "expired-user-password" }),
    ).rejects.toBeInstanceOf(InvalidUserInvitationError);
    const users = await getDatabasePool().query(`SELECT id FROM "user" WHERE lower(email) = $1`, [pending.email]);
    expect(users.rowCount).toBe(0);
  });
});
