import { randomBytes, randomUUID } from "node:crypto";

import { verifyPassword } from "better-auth/crypto";

import { getDatabaseSchemaName } from "@/db";
import { inspectAdminActivation } from "@/lib/admin/activation";
import { hashAdminSecret } from "@/lib/admin/crypto";
import {
  AdminInvitationConflictError,
  inviteUser as inviteAdministrator,
} from "@/lib/admin/invitations";
import { acceptUserInvitation } from "@/lib/invitations/acceptance";
import { InvitationLimitError } from "@/lib/invitations/errors";
import { invalidateInvitationsForIndependentRegistration } from "@/lib/invitations/registration";
import {
  createUserInvitation,
  resendUserInvitation,
  revokeUserInvitation,
} from "@/lib/invitations/service";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("invitation workflows", () => {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const marker = randomUUID();
  const inviterA = `integration-inviter-a-${marker}`;
  const inviterB = `integration-inviter-b-${marker}`;
  const inviterAEmail = `${inviterA}@example.com`;
  const inviterBEmail = `${inviterB}@example.com`;
  const roleId = randomUUID();
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Inviter A', $2, true, now(), now()),
              ($3, 'Inviter B', $4, true, now(), now())`,
      [inviterA, inviterAEmail, inviterB, inviterBEmail],
    );
    await getDatabasePool().query(
      `INSERT INTO ${schema}.admin_roles
        (id, name, description, permissions, created_by_user_id)
       VALUES ($1, $2, '', '["users.read"]'::jsonb, $3)`,
      [roleId, `Integration role ${marker}`, inviterA],
    );
  });

  afterEach(async () => {
    await getDatabasePool().query(
      `DELETE FROM ${schema}.user_invitations
        WHERE inviter_user_id = ANY($1::text[])`,
      [[inviterA, inviterB]],
    );
    if (createdUserIds.length === 0) return;
    const userIds = createdUserIds.splice(0);
    await getDatabasePool().query(
      `DELETE FROM ${schema}.admin_activation_tokens WHERE user_id = ANY($1::text[])`,
      [userIds],
    );
    await getDatabasePool().query(
      `DELETE FROM ${schema}.admin_assignments WHERE user_id = ANY($1::text[])`,
      [userIds],
    );
    await getDatabasePool().query(
      `DELETE FROM ${schema}.admin_principals WHERE user_id = ANY($1::text[])`,
      [userIds],
    );
    await getDatabasePool().query(
      `DELETE FROM "account" WHERE "userId" = ANY($1::text[])`,
      [userIds],
    );
    await getDatabasePool().query(
      `DELETE FROM "user" WHERE id = ANY($1::text[])`,
      [userIds],
    );
  });

  afterAll(async () => {
    await getDatabasePool().query(
      `DELETE FROM ${schema}.admin_roles WHERE id = $1`,
      [roleId],
    );
    await getDatabasePool().query(
      `DELETE FROM "user" WHERE id = ANY($1::text[])`,
      [[inviterA, inviterB]],
    );
  });

  async function createInvitation(
    inviterUserId: string,
    invitedEmail: string,
    now = new Date(),
  ) {
    let token = "";
    const result = await createUserInvitation({
      inviterUserId,
      inviterName: inviterUserId === inviterA ? "Inviter A" : "Inviter B",
      inviterEmail: inviterUserId === inviterA ? inviterAEmail : inviterBEmail,
      invitedEmail,
      now,
      deliverInvitation: async ({ url }) => {
        token = new URL(url).searchParams.get("token") ?? "";
      },
    });
    if (result.outcome !== "sent" || !token) {
      throw new Error("Expected invitation delivery");
    }
    return { ...result.invitation, token };
  }

  it("attributes acceptance to the link used and creates compatible credentials", async () => {
    const email = `accepted-${marker}@example.com`;
    const first = await createInvitation(inviterA, email);
    const second = await createInvitation(inviterB, email);

    const accepted = await acceptUserInvitation({
      token: second.token,
      name: "Accepted user",
      password: "accepted-user-password",
    });
    createdUserIds.push(accepted.userId);

    const invitations = await getDatabasePool().query<{
      id: string;
      acceptedByUserId: string | null;
      invalidationReason: string | null;
    }>(
      `SELECT id, accepted_by_user_id AS "acceptedByUserId",
              invalidation_reason AS "invalidationReason"
         FROM ${schema}.user_invitations
        WHERE id = ANY($1::uuid[])`,
      [[first.id, second.id]],
    );
    expect(invitations.rows.find((row) => row.id === second.id)).toMatchObject({
      acceptedByUserId: accepted.userId,
      invalidationReason: null,
    });
    expect(invitations.rows.find((row) => row.id === first.id)).toMatchObject({
      acceptedByUserId: null,
      invalidationReason: "accepted_via_other_invitation",
    });

    const credential = await getDatabasePool().query<{ password: string }>(
      `SELECT password FROM "account"
        WHERE "userId" = $1 AND "providerId" = 'credential'`,
      [accepted.userId],
    );
    expect(
      await verifyPassword({
        hash: credential.rows[0]!.password,
        password: "accepted-user-password",
      }),
    ).toBe(true);
  });

  it("enforces active slots while allowing repeated five-day resends", async () => {
    const expired = await createInvitation(
      inviterA,
      `expired-${marker}@example.com`,
      new Date("2026-09-01T00:00:00.000Z"),
    );
    const active = [];
    for (let index = 0; index < 5; index += 1) {
      active.push(await createInvitation(
        inviterA,
        `active-${index}-${marker}@example.com`,
        new Date("2026-09-10T00:00:00.000Z"),
      ));
    }

    await expect(resendUserInvitation({
      inviterUserId: inviterA,
      inviterName: "Inviter A",
      invitationId: expired.id,
      now: new Date("2026-09-10T00:00:00.000Z"),
      deliverInvitation: vi.fn(),
    })).rejects.toBeInstanceOf(InvitationLimitError);

    await revokeUserInvitation({
      inviterUserId: inviterA,
      invitationId: active[0]!.id,
      now: new Date("2026-09-10T00:00:00.000Z"),
    });

    for (const now of [
      "2026-09-10T00:00:00.000Z",
      "2026-09-15T00:00:00.000Z",
      "2026-09-20T00:00:00.000Z",
    ]) {
      await expect(resendUserInvitation({
        inviterUserId: inviterA,
        inviterName: "Inviter A",
        invitationId: expired.id,
        now: new Date(now),
        deliverInvitation: vi.fn(),
      })).resolves.toMatchObject({ outcome: "sent" });
    }
  });

  it("invalidates independent registrations and separates administrator invitations", async () => {
    const independentEmail = `independent-${marker}@example.com`;
    const independent = await createInvitation(inviterA, independentEmail);
    await invalidateInvitationsForIndependentRegistration(
      independentEmail,
      `registered-${marker}`,
    );
    const invalidated = await getDatabasePool().query<{
      reason: string | null;
      tokenHash: string | null;
    }>(
      `SELECT invalidation_reason AS reason, token_hash AS "tokenHash"
         FROM ${schema}.user_invitations WHERE id = $1`,
      [independent.id],
    );
    expect(invalidated.rows[0]).toEqual({
      reason: "registered_independently",
      tokenHash: null,
    });

    await expect(inviteAdministrator({
      actorUserId: inviterB,
      actorKind: "delegated_admin",
      name: "Forbidden administrator",
      email: `forbidden-admin-${marker}@example.com`,
      roleIds: [roleId],
      deliverInvitation: vi.fn(),
    })).rejects.toBeInstanceOf(AdminInvitationConflictError);

    const administrator = await inviteAdministrator({
      actorUserId: inviterA,
      actorKind: "super_admin",
      name: "Allowed administrator",
      email: `allowed-admin-${marker}@example.com`,
      roleIds: [roleId],
      deliverInvitation: vi.fn(),
    });
    createdUserIds.push(administrator.userId);
  });

  it("moves a migrated legacy product invitation to the new flow on resend", async () => {
    const legacyUserId = `legacy-${marker}`;
    const email = `${legacyUserId}@example.com`;
    const legacyToken = randomBytes(32).toString("base64url");
    createdUserIds.push(legacyUserId);
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Legacy user', $2, false, now(), now())`,
      [legacyUserId, email],
    );
    await getDatabasePool().query(
      `INSERT INTO ${schema}.admin_activation_tokens
        (user_id, purpose, token_hash, expires_at, created_at)
       VALUES ($1, 'product_user', $2, $3, $4)`,
      [
        legacyUserId,
        hashAdminSecret(legacyToken),
        new Date("2026-09-08T00:00:00.000Z"),
        new Date("2026-09-01T00:00:00.000Z"),
      ],
    );
    const invitation = await getDatabasePool().query<{ id: string }>(
      `INSERT INTO ${schema}.user_invitations
        (inviter_user_id, invited_email, token_hash, last_sent_at, expires_at,
         legacy_invited_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $4, $4)
       RETURNING id`,
      [
        inviterA,
        email,
        hashAdminSecret(legacyToken),
        new Date("2026-09-01T00:00:00.000Z"),
        new Date("2026-09-08T00:00:00.000Z"),
        legacyUserId,
      ],
    );

    let replacementUrl = "";
    await resendUserInvitation({
      inviterUserId: inviterA,
      inviterName: "Inviter A",
      invitationId: invitation.rows[0]!.id,
      now: new Date("2026-09-10T00:00:00.000Z"),
      deliverInvitation: async ({ url }) => {
        replacementUrl = url;
      },
    });

    expect(replacementUrl).toContain("/accept-invitation?token=");
    await expect(inspectAdminActivation(legacyToken)).rejects.toThrow();
    const replacementToken = new URL(replacementUrl).searchParams.get("token")!;
    await expect(acceptUserInvitation({
      token: replacementToken,
      name: "Migrated user",
      password: "migrated-user-password",
      now: new Date("2026-09-11T00:00:00.000Z"),
    })).resolves.toMatchObject({ userId: legacyUserId });
  });
});
