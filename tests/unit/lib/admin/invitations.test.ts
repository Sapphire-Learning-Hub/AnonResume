import { randomUUID } from "node:crypto";

import { Secret, TOTP } from "otpauth";

import { getDatabaseSchemaName } from "@/db";
import {
  completeAdminActivation,
  inspectAdminActivation,
  startAdminActivation,
} from "@/lib/admin/activation";
import {
  AdminInvitationConflictError,
  inviteUser,
  resendUserInvitation,
} from "@/lib/admin/invitations";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("administrator invitations", () => {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const actorUserId = `invite-actor-${randomUUID()}`;
  const roleIds = [randomUUID(), randomUUID()];
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
      await getDatabasePool().query(
        `DELETE FROM "user" WHERE id = ANY($1::text[])`,
        [createdUserIds],
      );
    }
    await getDatabasePool().query(
      `DELETE FROM ${schema}.admin_roles WHERE id = ANY($1::uuid[])`,
      [roleIds],
    );
    await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [actorUserId]);
  });

  async function createAdministrator(
    email: string,
    deliverInvitation: NonNullable<Parameters<typeof inviteUser>[0]["deliverInvitation"]>,
  ) {
    const result = await inviteUser({
      actorUserId,
      actorKind: "super_admin",
      name: "Invited administrator",
      email,
      roleIds,
      deliverInvitation,
    });
    createdUserIds.push(result.userId);
    return result;
  }

  it("creates a pending administrator and requires MFA during activation", async () => {
    const email = `invite-${randomUUID()}@example.com`;
    let activationUrl = "";
    const result = await createAdministrator(email, async ({ url }) => {
      activationUrl = url;
    });

    const token = new URL(activationUrl).searchParams.get("token")!;
    await expect(inspectAdminActivation(token)).resolves.toMatchObject({
      email,
      purpose: "delegated_admin",
      requiresMfa: true,
    });
    const assignments = await getDatabasePool().query<{ role_id: string }>(
      `SELECT role_id::text FROM ${schema}.admin_assignments
        WHERE user_id = $1 ORDER BY role_id`,
      [result.userId],
    );
    expect(assignments.rows.map((row) => row.role_id)).toEqual([...roleIds].sort());

    const enrollment = await startAdminActivation({
      token,
      password: "admin-invitation-password",
      deviceName: "Primary",
    });
    expect(enrollment.completed).toBe(false);
    if (enrollment.completed) throw new Error("Expected MFA enrollment");
    const code = new TOTP({ secret: Secret.fromBase32(enrollment.secret) }).generate();
    await expect(completeAdminActivation({
      token,
      deviceId: enrollment.deviceId,
      code,
      password: "admin-invitation-password",
    })).resolves.toMatchObject({ recoveryCodes: expect.any(Array) });
  });

  it("rejects invitations without roles and invitations from delegated administrators", async () => {
    await expect(inviteUser({
      actorUserId,
      actorKind: "super_admin",
      name: "No role",
      email: `no-role-${randomUUID()}@example.com`,
      roleIds: [],
      deliverInvitation: vi.fn(),
    })).rejects.toBeInstanceOf(AdminInvitationConflictError);

    await expect(inviteUser({
      actorUserId,
      actorKind: "delegated_admin",
      name: "Forbidden",
      email: `forbidden-${randomUUID()}@example.com`,
      roleIds,
      deliverInvitation: vi.fn(),
    })).rejects.toBeInstanceOf(AdminInvitationConflictError);
  });

  it("replaces an expired administrator invitation without changing roles", async () => {
    const email = `resend-${randomUUID()}@example.com`;
    let originalUrl = "";
    const invited = await createAdministrator(email, async ({ url }) => {
      originalUrl = url;
    });
    const originalToken = new URL(originalUrl).searchParams.get("token")!;
    await getDatabasePool().query(
      `UPDATE ${schema}.admin_activation_tokens
          SET expires_at = now() - interval '1 minute'
        WHERE user_id = $1`,
      [invited.userId],
    );

    let resentUrl = "";
    await resendUserInvitation({
      actorUserId,
      actorKind: "super_admin",
      userId: invited.userId,
      deliverInvitation: async ({ url }) => {
        resentUrl = url;
      },
    });

    const resentToken = new URL(resentUrl).searchParams.get("token")!;
    expect(resentToken).not.toBe(originalToken);
    await expect(inspectAdminActivation(originalToken)).rejects.toThrow();
    await expect(inspectAdminActivation(resentToken)).resolves.toMatchObject({
      purpose: "delegated_admin",
    });
  });

  it("keeps the current administrator invitation usable when redelivery fails", async () => {
    const email = `failure-${randomUUID()}@example.com`;
    let activationUrl = "";
    const invited = await createAdministrator(email, async ({ url }) => {
      activationUrl = url;
    });
    const token = new URL(activationUrl).searchParams.get("token")!;

    await expect(resendUserInvitation({
      actorUserId,
      actorKind: "super_admin",
      userId: invited.userId,
      deliverInvitation: async () => {
        throw new Error("mail unavailable");
      },
    })).rejects.toThrow("mail unavailable");
    await expect(inspectAdminActivation(token)).resolves.toMatchObject({
      email,
      purpose: "delegated_admin",
    });
  });

  it("does not let a delegated administrator resend a management invitation", async () => {
    const invited = await createAdministrator(
      `protected-${randomUUID()}@example.com`,
      vi.fn(),
    );

    await expect(resendUserInvitation({
      actorUserId,
      actorKind: "delegated_admin",
      userId: invited.userId,
      deliverInvitation: vi.fn(),
    })).rejects.toBeInstanceOf(AdminInvitationConflictError);
  });
});
