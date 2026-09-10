import { randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";
import {
  AdminMfaResetRequestConflictError,
  AdminMfaResetRequestForbiddenError,
  cancelAdminMfaResetRequest,
  getAdminMfaResetRequestForUser,
  listAdminMfaResetRequests,
  reviewAdminMfaResetRequest,
  submitAdminMfaResetRequest,
} from "@/lib/admin/mfa-reset-requests";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("delegated administrator MFA reset requests", () => {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const superAdminId = `mfa-reset-super-${randomUUID()}`;
  const delegatedAdminId = `mfa-reset-delegated-${randomUUID()}`;
  const otherDelegatedAdminId = `mfa-reset-other-${randomUUID()}`;
  const baseSessionId = `mfa-reset-session-${randomUUID()}`;
  const roleId = randomUUID();
  const secondRoleId = randomUUID();

  beforeAll(async () => {
    const pool = getDatabasePool();
    for (const id of [superAdminId, delegatedAdminId, otherDelegatedAdminId]) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, 'MFA reset test', $2, true, now(), now())`,
        [id, `${id}@example.com`],
      );
    }
    await pool.query(
      `INSERT INTO "session"
        (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
       VALUES ($1, now() + interval '8 hours', $2, now(), now(), $3)`,
      [baseSessionId, `base-token-${randomUUID()}`, otherDelegatedAdminId],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_principals
        (user_id, kind, singleton_slot) VALUES ($1, 'super_admin', 1)`,
      [superAdminId],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_principals (user_id, kind)
       VALUES ($1, 'delegated_admin'), ($2, 'delegated_admin')`,
      [delegatedAdminId, otherDelegatedAdminId],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_roles
        (id, name, description, permissions, created_by_user_id)
       VALUES ($1, $3, '', '["overview.read"]'::jsonb, $5),
              ($2, $4, '', '["audit.read"]'::jsonb, $5)`,
      [
        roleId,
        secondRoleId,
        `MFA reset test ${roleId}`,
        `MFA reset test ${secondRoleId}`,
        superAdminId,
      ],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_assignments
        (user_id, role_id, assigned_by_user_id)
       VALUES ($1, $3, $2), ($4, $3, $2), ($4, $5, $2)`,
      [
        delegatedAdminId,
        superAdminId,
        roleId,
        otherDelegatedAdminId,
        secondRoleId,
      ],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_mfa_devices
        (user_id, name, encrypted_secret, encryption_iv, encryption_tag, verified_at)
       VALUES ($1, 'Lost device', 'ciphertext', 'iv', 'tag', now()),
              ($2, 'Other device', 'ciphertext', 'iv', 'tag', now())`,
      [delegatedAdminId, otherDelegatedAdminId],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_recovery_codes (user_id, code_hash)
       VALUES ($1, $2), ($3, $4)`,
      [
        delegatedAdminId,
        `recovery-${randomUUID()}`,
        otherDelegatedAdminId,
        `recovery-${randomUUID()}`,
      ],
    );
  });

  afterAll(async () => {
    const pool = getDatabasePool();
    await pool.query(
      `DELETE FROM ${schema}.admin_mfa_reset_requests
       WHERE requester_user_id = ANY($1::text[])`,
      [[delegatedAdminId, otherDelegatedAdminId]],
    );
    for (const table of [
      "admin_sessions",
      "admin_recovery_codes",
      "admin_mfa_devices",
      "admin_security_states",
    ]) {
      await pool.query(
        `DELETE FROM ${schema}.${table} WHERE user_id = ANY($1::text[])`,
        [[superAdminId, delegatedAdminId, otherDelegatedAdminId]],
      );
    }
    await pool.query(
      `DELETE FROM ${schema}.admin_assignments
       WHERE user_id = ANY($1::text[])`,
      [[delegatedAdminId, otherDelegatedAdminId]],
    );
    await pool.query(
      `DELETE FROM ${schema}.admin_roles WHERE id = ANY($1::uuid[])`,
      [[roleId, secondRoleId]],
    );
    await pool.query(
      `DELETE FROM ${schema}.admin_principals WHERE user_id = ANY($1::text[])`,
      [[superAdminId, delegatedAdminId, otherDelegatedAdminId]],
    );
    await pool.query(`DELETE FROM "session" WHERE id = $1`, [baseSessionId]);
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [
      [superAdminId, delegatedAdminId, otherDelegatedAdminId],
    ]);
  });

  it("allows one pending request for a delegated administrator", async () => {
    const request = await submitAdminMfaResetRequest({
      userId: delegatedAdminId,
      reason: "  Lost my phone and offline recovery codes.  ",
    });

    expect(request).toMatchObject({
      reason: "Lost my phone and offline recovery codes.",
      requesterUserId: delegatedAdminId,
      status: "pending",
    });
    await expect(
      submitAdminMfaResetRequest({
        userId: delegatedAdminId,
        reason: "Duplicate request",
      }),
    ).rejects.toBeInstanceOf(AdminMfaResetRequestConflictError);
    await expect(getAdminMfaResetRequestForUser(delegatedAdminId)).resolves
      .toMatchObject({ id: request.id, status: "pending" });
  });

  it("never permits the singleton super-admin to use web reset requests", async () => {
    await expect(
      submitAdminMfaResetRequest({
        userId: superAdminId,
        reason: "Attempt a web reset",
      }),
    ).rejects.toBeInstanceOf(AdminMfaResetRequestForbiddenError);
  });

  it("lets the requester cancel a pending request", async () => {
    const current = await getAdminMfaResetRequestForUser(delegatedAdminId);
    expect(current).not.toBeNull();

    await cancelAdminMfaResetRequest({
      requestId: current!.id,
      userId: delegatedAdminId,
    });

    await expect(getAdminMfaResetRequestForUser(delegatedAdminId)).resolves
      .toMatchObject({ id: current!.id, status: "cancelled" });
  });

  it("only lets the super-admin approve and atomically resets MFA access", async () => {
    const request = await submitAdminMfaResetRequest({
      userId: otherDelegatedAdminId,
      reason: "Authenticator and recovery codes are unavailable.",
    });

    const pool = getDatabasePool();
    await pool.query(
      `INSERT INTO ${schema}.admin_sessions
        (user_id, base_session_id, mfa_device_id, token_hash, access_version,
         last_seen_at, idle_expires_at, absolute_expires_at, created_at)
       SELECT $1, $3, id, $2, 1, now(), now() + interval '1 hour',
         now() + interval '8 hours', now()
         FROM ${schema}.admin_mfa_devices
        WHERE user_id = $1 LIMIT 1`,
      [otherDelegatedAdminId, `token-${randomUUID()}`, baseSessionId],
    );

    await expect(
      reviewAdminMfaResetRequest({
        actorUserId: delegatedAdminId,
        decision: "approved",
        requestId: request.id,
      }),
    ).rejects.toBeInstanceOf(AdminMfaResetRequestForbiddenError);

    const reviewed = await reviewAdminMfaResetRequest({
      actorUserId: superAdminId,
      decision: "approved",
      requestId: request.id,
    });
    expect(reviewed).toMatchObject({
      reviewerUserId: superAdminId,
      status: "approved",
    });

    const devices = await pool.query(
      `SELECT 1 FROM ${schema}.admin_mfa_devices WHERE user_id = $1`,
      [otherDelegatedAdminId],
    );
    const recoveryCodes = await pool.query(
      `SELECT 1 FROM ${schema}.admin_recovery_codes WHERE user_id = $1`,
      [otherDelegatedAdminId],
    );
    const sessions = await pool.query<{ revokedAt: Date | null }>(
      `SELECT revoked_at AS "revokedAt" FROM ${schema}.admin_sessions
        WHERE user_id = $1`,
      [otherDelegatedAdminId],
    );
    expect(devices.rowCount).toBe(0);
    expect(recoveryCodes.rowCount).toBe(0);
    expect(sessions.rows).toEqual([
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    ]);
    const baseSession = await pool.query(
      `SELECT 1 FROM "session" WHERE id = $1`,
      [baseSessionId],
    );
    expect(baseSession.rowCount).toBe(1);
  });

  it("expires stale requests before allowing a replacement", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const request = await submitAdminMfaResetRequest({
      userId: delegatedAdminId,
      reason: "My authenticator and recovery codes were both lost.",
      now: createdAt,
    });

    await getAdminMfaResetRequestForUser(
      delegatedAdminId,
      new Date("2026-01-05T00:00:00.000Z"),
    );
    const expired = await getDatabasePool().query<{ status: string }>(
      `SELECT status FROM ${schema}.admin_mfa_reset_requests WHERE id = $1`,
      [request.id],
    );
    expect(expired.rows[0]?.status).toBe("expired");

    await expect(
      submitAdminMfaResetRequest({
        userId: delegatedAdminId,
        reason: "Submitting a replacement after the first request expired.",
        now: new Date("2026-01-05T00:00:01.000Z"),
      }),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("requires a reason when the super-admin rejects a request", async () => {
    const current = await getAdminMfaResetRequestForUser(delegatedAdminId);
    expect(current).not.toBeNull();

    await expect(
      reviewAdminMfaResetRequest({
        actorUserId: superAdminId,
        decision: "rejected",
        requestId: current!.id,
      }),
    ).rejects.toBeInstanceOf(AdminMfaResetRequestConflictError);
  });

  it("lists requests with page-number pagination", async () => {
    const result = await listAdminMfaResetRequests({ page: 1, pageSize: 1 });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.items).toHaveLength(1);
  });
});
