import { randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";
import {
  InvitationLimitError,
  InvitationNotActionableError,
} from "@/lib/invitations/errors";
import {
  createUserInvitation,
  listUserInvitations,
  resendUserInvitation,
  revokeUserInvitation,
} from "@/lib/invitations/service";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("product user invitations", () => {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const inviterA = `inviter-a-${randomUUID()}`;
  const inviterB = `inviter-b-${randomUUID()}`;
  const inviterAEmail = `${inviterA}@example.com`;
  const inviterBEmail = `${inviterB}@example.com`;
  const createdUserIds = [inviterA, inviterB];

  beforeAll(async () => {
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Inviter A', $2, true, now(), now()),
              ($3, 'Inviter B', $4, true, now(), now())`,
      [inviterA, inviterAEmail, inviterB, inviterBEmail],
    );
  });

  afterEach(async () => {
    await getDatabasePool().query(
      `DELETE FROM ${schema}.user_invitations
        WHERE inviter_user_id = ANY($1::text[])`,
      [[inviterA, inviterB]],
    );
    if (createdUserIds.length > 2) {
      await getDatabasePool().query(
        `DELETE FROM "user" WHERE id = ANY($1::text[])`,
        [createdUserIds.splice(2)],
      );
    }
  });

  afterAll(async () => {
    await getDatabasePool().query(
      `DELETE FROM "user" WHERE id = ANY($1::text[])`,
      [[inviterA, inviterB]],
    );
  });

  it("creates a seven-day invitation owned by the current user", async () => {
    const now = new Date("2026-09-24T00:00:00.000Z");
    let deliveredUrl = "";

    const result = await createUserInvitation({
      inviterUserId: inviterA,
      inviterName: "Inviter A",
      inviterEmail: inviterAEmail,
      invitedEmail: `new-${randomUUID()}@example.com`,
      now,
      deliverInvitation: async ({ url }) => {
        deliveredUrl = url;
      },
    });

    expect(result.outcome).toBe("sent");
    if (result.outcome !== "sent") throw new Error("Expected sent invitation");
    expect(result.invitation.expiresAt).toEqual(
      new Date("2026-10-01T00:00:00.000Z"),
    );
    expect(deliveredUrl).toContain("/accept-invitation?token=");
    const stored = await getDatabasePool().query<{
      inviterUserId: string;
      tokenHash: string;
    }>(
      `SELECT inviter_user_id AS "inviterUserId", token_hash AS "tokenHash"
         FROM ${schema}.user_invitations WHERE id = $1`,
      [result.invitation.id],
    );
    expect(stored.rows[0]?.inviterUserId).toBe(inviterA);
    expect(deliveredUrl).not.toContain(stored.rows[0]?.tokenHash ?? "missing");
  });

  it("returns handled without sending when the email already belongs to a user", async () => {
    const existingUserId = `existing-${randomUUID()}`;
    const existingEmail = `${existingUserId}@example.com`;
    createdUserIds.push(existingUserId);
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Existing', $2, true, now(), now())`,
      [existingUserId, existingEmail],
    );
    const deliver = vi.fn();

    await expect(
      createUserInvitation({
        inviterUserId: inviterA,
        inviterName: "Inviter A",
        inviterEmail: inviterAEmail,
        invitedEmail: existingEmail,
        deliverInvitation: deliver,
      }),
    ).resolves.toEqual({ outcome: "handled" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("allows different inviters to hold active links for the same email", async () => {
    const email = `shared-${randomUUID()}@example.com`;
    const deliver = vi.fn().mockResolvedValue(undefined);

    await createUserInvitation({
      inviterUserId: inviterA,
      inviterName: "Inviter A",
      inviterEmail: inviterAEmail,
      invitedEmail: email,
      deliverInvitation: deliver,
    });
    await createUserInvitation({
      inviterUserId: inviterB,
      inviterName: "Inviter B",
      inviterEmail: inviterBEmail,
      invitedEmail: email,
      deliverInvitation: deliver,
    });

    const result = await getDatabasePool().query<{ inviterUserId: string }>(
      `SELECT inviter_user_id AS "inviterUserId"
         FROM ${schema}.user_invitations WHERE invited_email = $1`,
      [email],
    );
    expect(result.rows.map((row) => row.inviterUserId).sort()).toEqual(
      [inviterA, inviterB].sort(),
    );
  });

  it("does not duplicate a non-terminal invitation from the same inviter", async () => {
    const email = `dedupe-${randomUUID()}@example.com`;
    const deliver = vi.fn().mockResolvedValue(undefined);
    const input = {
      inviterUserId: inviterA,
      inviterName: "Inviter A",
      inviterEmail: inviterAEmail,
      invitedEmail: email,
      deliverInvitation: deliver,
    };

    await createUserInvitation(input);
    await expect(createUserInvitation(input)).resolves.toEqual({
      outcome: "handled",
    });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent invitations from the same inviter", async () => {
    const email = `concurrent-${randomUUID()}@example.com`;
    const deliver = vi.fn().mockResolvedValue(undefined);
    const input = {
      inviterUserId: inviterA,
      inviterName: "Inviter A",
      inviterEmail: inviterAEmail,
      invitedEmail: email,
      deliverInvitation: deliver,
    };

    const results = await Promise.all([
      createUserInvitation(input),
      createUserInvitation(input),
    ]);

    expect(results.map((result) => result.outcome).sort()).toEqual([
      "handled",
      "sent",
    ]);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("rejects a sixth simultaneously active invitation", async () => {
    for (let index = 0; index < 5; index += 1) {
      await createUserInvitation({
        inviterUserId: inviterA,
        inviterName: "Inviter A",
        inviterEmail: inviterAEmail,
        invitedEmail: `limit-${index}-${randomUUID()}@example.com`,
        deliverInvitation: async () => undefined,
      });
    }

    await expect(
      createUserInvitation({
        inviterUserId: inviterA,
        inviterName: "Inviter A",
        inviterEmail: inviterAEmail,
        invitedEmail: `limit-six-${randomUUID()}@example.com`,
        deliverInvitation: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(InvitationLimitError);
  });

  it("serializes concurrent attempts for the fifth active slot", async () => {
    for (let index = 0; index < 4; index += 1) {
      await createUserInvitation({
        inviterUserId: inviterA,
        inviterName: "Inviter A",
        inviterEmail: inviterAEmail,
        invitedEmail: `concurrent-limit-${index}-${randomUUID()}@example.com`,
        deliverInvitation: async () => undefined,
      });
    }

    const results = await Promise.allSettled([
      createUserInvitation({
        inviterUserId: inviterA,
        inviterName: "Inviter A",
        inviterEmail: inviterAEmail,
        invitedEmail: `concurrent-limit-a-${randomUUID()}@example.com`,
        deliverInvitation: async () => undefined,
      }),
      createUserInvitation({
        inviterUserId: inviterA,
        inviterName: "Inviter A",
        inviterEmail: inviterAEmail,
        invitedEmail: `concurrent-limit-b-${randomUUID()}@example.com`,
        deliverInvitation: async () => undefined,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(InvitationLimitError) });
  });

  it("allows an expired invitation to be resent after five days", async () => {
    const created = await createUserInvitation({
      inviterUserId: inviterA,
      inviterName: "Inviter A",
      inviterEmail: inviterAEmail,
      invitedEmail: `expired-${randomUUID()}@example.com`,
      now: new Date("2026-09-01T00:00:00.000Z"),
      deliverInvitation: async () => undefined,
    });
    if (created.outcome !== "sent") throw new Error("Expected sent invitation");
    let resentUrl = "";

    const resent = await resendUserInvitation({
      inviterUserId: inviterA,
      invitationId: created.invitation.id,
      inviterName: "Inviter A",
      now: new Date("2026-09-10T00:00:00.000Z"),
      deliverInvitation: async ({ url }) => {
        resentUrl = url;
      },
    });

    expect(resent.outcome).toBe("sent");
    if (resent.outcome !== "sent") throw new Error("Expected resent invitation");
    expect(resent.invitation.expiresAt).toEqual(
      new Date("2026-09-17T00:00:00.000Z"),
    );
    expect(resentUrl).toContain("/accept-invitation?token=");
  });

  it("keeps the old token when resend delivery fails", async () => {
    const created = await createUserInvitation({
      inviterUserId: inviterA,
      inviterName: "Inviter A",
      inviterEmail: inviterAEmail,
      invitedEmail: `failure-${randomUUID()}@example.com`,
      now: new Date("2026-09-01T00:00:00.000Z"),
      deliverInvitation: async () => undefined,
    });
    if (created.outcome !== "sent") throw new Error("Expected sent invitation");
    const before = await getDatabasePool().query<{
      tokenHash: string;
      expiresAt: Date;
    }>(
      `SELECT token_hash AS "tokenHash", expires_at AS "expiresAt"
         FROM ${schema}.user_invitations WHERE id = $1`,
      [created.invitation.id],
    );

    await expect(
      resendUserInvitation({
        inviterUserId: inviterA,
        invitationId: created.invitation.id,
        inviterName: "Inviter A",
        now: new Date("2026-09-10T00:00:00.000Z"),
        deliverInvitation: async () => {
          throw new Error("mail unavailable");
        },
      }),
    ).rejects.toThrow("mail unavailable");
    const after = await getDatabasePool().query<{
      tokenHash: string;
      expiresAt: Date;
    }>(
      `SELECT token_hash AS "tokenHash", expires_at AS "expiresAt"
         FROM ${schema}.user_invitations WHERE id = $1`,
      [created.invitation.id],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("revokes only the caller's pending invitation and releases the slot", async () => {
    const invitations = [];
    for (let index = 0; index < 5; index += 1) {
      const result = await createUserInvitation({
        inviterUserId: inviterA,
        inviterName: "Inviter A",
        inviterEmail: inviterAEmail,
        invitedEmail: `revoke-${index}-${randomUUID()}@example.com`,
        deliverInvitation: async () => undefined,
      });
      if (result.outcome === "sent") invitations.push(result.invitation);
    }

    await expect(
      revokeUserInvitation({
        inviterUserId: inviterB,
        invitationId: invitations[0]!.id,
      }),
    ).rejects.toBeInstanceOf(InvitationNotActionableError);
    await revokeUserInvitation({
      inviterUserId: inviterA,
      invitationId: invitations[0]!.id,
    });
    await expect(
      createUserInvitation({
        inviterUserId: inviterA,
        inviterName: "Inviter A",
        inviterEmail: inviterAEmail,
        invitedEmail: `replacement-${randomUUID()}@example.com`,
        deliverInvitation: async () => undefined,
      }),
    ).resolves.toMatchObject({ outcome: "sent" });
    await expect(listUserInvitations(inviterA)).resolves.toMatchObject({
      activeCount: 5,
      limit: 5,
    });
  });
});
