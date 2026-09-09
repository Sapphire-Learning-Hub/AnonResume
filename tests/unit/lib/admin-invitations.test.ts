import { randomUUID } from "node:crypto";

import { Secret, TOTP } from "otpauth";

import { getDatabaseSchemaName } from "@/db";
import {
  completeAdminActivation,
  inspectAdminActivation,
  startAdminActivation,
} from "@/lib/admin-activation";
import {
  AdminInvitationConflictError,
  inviteUser,
} from "@/lib/admin-invitations";
import { getDatabasePool } from "@/lib/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("administrative user invitations", () => {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const actorUserId = `invite-actor-${randomUUID()}`;
  const roleIds = [randomUUID(), randomUUID()];
  const invitedEmail = `invite-${randomUUID()}@example.com`;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Invite actor', $2, true, now(), now())`,
      [actorUserId, `${actorUserId}@example.com`],
    );
    await getDatabasePool().query(
      `INSERT INTO ${schema}.admin_roles
        (id, name, description, permissions, created_by_user_id)
       VALUES
         ($1, $3, '', '["users.read"]'::jsonb, $5),
         ($2, $4, '', '["audit.read"]'::jsonb, $5)`,
      [
        roleIds[0],
        roleIds[1],
        `Invite role ${roleIds[0]}`,
        `Invite role ${roleIds[1]}`,
        actorUserId,
      ],
    );
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      for (const table of [
        "admin_sessions",
        "admin_recovery_codes",
        "admin_mfa_devices",
        "admin_security_states",
      ]) {
        await getDatabasePool().query(
          `DELETE FROM ${schema}.${table} WHERE user_id = ANY($1::text[])`,
          [createdUserIds],
        );
      }
      await getDatabasePool().query(
        `DELETE FROM ${schema}.admin_activation_tokens WHERE user_id = ANY($1::text[])`,
        [createdUserIds],
      );
      await getDatabasePool().query(
        `DELETE FROM ${schema}.admin_assignments WHERE user_id = ANY($1::text[])`,
        [createdUserIds],
      );
      await getDatabasePool().query(
        `DELETE FROM ${schema}.admin_principals WHERE user_id = ANY($1::text[])`,
        [createdUserIds],
      );
      await getDatabasePool().query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [createdUserIds]);
    }
    await getDatabasePool().query(
      `DELETE FROM ${schema}.admin_roles WHERE id = ANY($1::uuid[])`,
      [roleIds],
    );
    await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [actorUserId]);
  });

  it("creates a pending delegated account and sends a one-time activation link", async () => {
    let activationUrl = "";
    const result = await inviteUser({
      actorUserId,
      actorKind: "super_admin",
      name: "Invited administrator",
      email: invitedEmail,
      roleIds,
      deliverInvitation: async ({ url }) => {
        activationUrl = url;
      },
    });
    createdUserIds.push(result.userId);
    expect(activationUrl).toMatch(/^http:\/\/localhost:3000\/activate\?token=/);

    const token = new URL(activationUrl).searchParams.get("token")!;
    await expect(inspectAdminActivation(token)).resolves.toMatchObject({
      email: invitedEmail,
      purpose: "delegated_admin",
      requiresMfa: true,
    });
    const assignment = await getDatabasePool().query<{ role_id: string }>(
      `SELECT role_id::text FROM ${schema}.admin_assignments
        WHERE user_id = $1 ORDER BY role_id`,
      [result.userId],
    );
    expect(assignment.rows.map((row) => row.role_id)).toEqual(
      [...roleIds].sort(),
    );

    const enrollment = await startAdminActivation({
      token,
      password: "admin-invitation-password",
      deviceName: "Primary",
    });
    expect(enrollment.completed).toBe(false);
    if (enrollment.completed) throw new Error("Expected MFA enrollment");
    const code = new TOTP({
      secret: Secret.fromBase32(enrollment.secret),
    }).generate();
    await expect(
      completeAdminActivation({
        token,
        deviceId: enrollment.deviceId,
        code,
        password: "admin-invitation-password",
      }),
    ).resolves.toMatchObject({ recoveryCodes: expect.any(Array) });
    await expect(inspectAdminActivation(token)).rejects.toThrow();

    await expect(
      inviteUser({
        actorUserId,
        actorKind: "super_admin",
        name: "Duplicate",
        email: invitedEmail,
        deliverInvitation: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(AdminInvitationConflictError);
  });

  it("activates an invited product user without requiring management MFA", async () => {
    let activationUrl = "";
    const email = `product-${randomUUID()}@example.com`;
    const result = await inviteUser({
      actorUserId,
      actorKind: "delegated_admin",
      name: "Product user",
      email,
      deliverInvitation: async ({ url }) => {
        activationUrl = url;
      },
    });
    createdUserIds.push(result.userId);
    const token = new URL(activationUrl).searchParams.get("token")!;

    await expect(
      startAdminActivation({
        token,
        password: "product-invitation-password",
        deviceName: "unused",
      }),
    ).resolves.toEqual({ completed: true });
    const identity = await getDatabasePool().query(
      `SELECT "emailVerified" FROM "user" WHERE id = $1`,
      [result.userId],
    );
    expect(identity.rows[0]?.emailVerified).toBe(true);
  });

  it("does not let a delegated administrator grant a role through an invitation", async () => {
    await expect(
      inviteUser({
        actorUserId,
        actorKind: "delegated_admin",
        name: "Forbidden",
        email: `forbidden-${randomUUID()}@example.com`,
        roleIds,
        deliverInvitation: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(AdminInvitationConflictError);
  });
});
