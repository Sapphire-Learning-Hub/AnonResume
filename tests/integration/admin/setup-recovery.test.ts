import { randomUUID } from "node:crypto";

import {
  db,
  getDatabaseSchemaName,
  instanceSetupClaimLimits,
  instanceSetupSessions,
  instanceSetupState,
  instanceSetupTokens,
} from "@/db";
import { beginInstanceSetupAccount } from "@/lib/admin/setup/completion";
import { deactivateInstanceSetup } from "@/lib/admin/setup/recovery";
import {
  claimInstanceSetupCode,
  requireInstanceSetupSession,
} from "@/lib/admin/setup/session";
import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";
import { getDatabasePool } from "@/lib/runtime/database";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";

const schema = quoteIdentifier(getDatabaseSchemaName());
const marker = randomUUID();
const ownerId = `setup-recovery-owner-${marker}`;
const delegatedId = `setup-recovery-delegated-${marker}`;
const ownerSessionId = `setup-recovery-owner-session-${marker}`;
const delegatedSessionId = `setup-recovery-delegated-session-${marker}`;
const resumeId = `setup-recovery-resume-${marker}`;
const reason = `Lost all recovery credentials ${marker}`;
const deploymentId = resolveRuntimeIdentity("web").deploymentId;

describe("instance setup recovery transition", () => {
  beforeEach(async () => {
    await cleanup();
    await db.insert(instanceSetupState).values({
      slot: 1,
      state: "completed",
      completedAt: new Date(),
    });
  });

  afterAll(cleanup);

  it("freezes management, revokes owner sessions, and preserves business data", async () => {
    await createIdentity(ownerId, "super_admin", ownerSessionId);
    await createIdentity(delegatedId, "delegated_admin", delegatedSessionId);
    await createAdminSession(ownerId, ownerSessionId);
    await createAdminSession(delegatedId, delegatedSessionId);
    await getDatabasePool().query(
      `INSERT INTO ${schema}.resumes
        (id, user_id, name, summary, document)
       VALUES ($1, $2, 'Recovery resume', '', '{}'::jsonb)`,
      [resumeId, ownerId],
    );
    const configurationCount = await countConfigurationRevisions();

    await expect(
      deactivateInstanceSetup({ deploymentId, reason }),
    ).resolves.toEqual({
      state: "pending_admin_recovery",
      targetUserId: ownerId,
    });

    await expect(readSetupState()).resolves.toMatchObject({
      state: "pending_admin_recovery",
      targetUserId: ownerId,
      recoveryReason: reason,
    });
    await expect(activeAdminSessions()).resolves.toEqual([]);
    await expect(baseSessionIds()).resolves.toEqual([delegatedSessionId]);
    await expect(accessVersions()).resolves.toEqual([
      { userId: delegatedId, accessVersion: 2 },
      { userId: ownerId, accessVersion: 2 },
    ]);
    await expect(resumeCount()).resolves.toBe(1);
    await expect(countConfigurationRevisions()).resolves.toBe(configurationCount);
    await expect(recoveryAudit()).resolves.toMatchObject({
      actorUserId: null,
      targetId: deploymentId,
      metadata: {
        deploymentId,
        reason,
        targetUserId: ownerId,
      },
    });
  });

  it("allows a replacement identity when no active super-admin remains", async () => {
    await deactivateInstanceSetup({ deploymentId, reason });
    const issued = await initializePendingInstanceSetup({
      identity: { stableId: `${deploymentId}/web/recovery-test` },
    });
    if (!issued.generated) throw new Error("recovery setup code was not issued");
    const claimed = await claimInstanceSetupCode(issued.rawCode, marker);
    const session = await requireInstanceSetupSession(
      new Request("http://localhost/setup", {
        headers: { cookie: `anonresume.setup=${claimed.rawSessionToken}` },
      }),
    );

    await beginInstanceSetupAccount({
      session,
      name: "Replacement Owner",
      email: `replacement-${marker}@example.com`,
      password: "long-secure-password",
      deviceName: "Primary authenticator",
    });

    const state = await readSetupState();
    expect(state.targetUserId).toBeTruthy();
  });
});

async function createIdentity(
  userId: string,
  kind: "delegated_admin" | "super_admin",
  sessionId: string,
) {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, 'Recovery test', $2, true, now(), now())`,
    [userId, `${userId}@example.com`],
  );
  await pool.query(
    `INSERT INTO ${schema}.admin_principals (user_id, kind, singleton_slot)
     VALUES ($1, $2, $3)`,
    [userId, kind, kind === "super_admin" ? 1 : null],
  );
  await pool.query(
    `INSERT INTO "session"
      (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
     VALUES ($1, now() + interval '8 hours', $2, now(), now(), $3)`,
    [sessionId, `token-${sessionId}`, userId],
  );
}

async function createAdminSession(userId: string, baseSessionId: string) {
  await getDatabasePool().query(
    `INSERT INTO ${schema}.admin_sessions
      (user_id, base_session_id, token_hash, access_version,
       idle_expires_at, absolute_expires_at)
     VALUES ($1, $2, $3, 1, now() + interval '1 hour', now() + interval '8 hours')`,
    [userId, baseSessionId, `hash-${baseSessionId}`],
  );
}

async function readSetupState() {
  const result = await getDatabasePool().query<{
    state: string;
    targetUserId: string | null;
    recoveryReason: string | null;
  }>(
    `SELECT state, target_user_id AS "targetUserId",
            recovery_reason AS "recoveryReason"
       FROM ${schema}.instance_setup_state WHERE slot = 1`,
  );
  return result.rows[0]!;
}

async function activeAdminSessions() {
  const result = await getDatabasePool().query(
    `SELECT id FROM ${schema}.admin_sessions WHERE revoked_at IS NULL`,
  );
  return result.rows;
}

async function baseSessionIds() {
  const result = await getDatabasePool().query<{ id: string }>(
    `SELECT id FROM "session" WHERE id = ANY($1::text[]) ORDER BY id`,
    [[ownerSessionId, delegatedSessionId]],
  );
  return result.rows.map((row) => row.id);
}

async function accessVersions() {
  const result = await getDatabasePool().query<{
    userId: string;
    accessVersion: number;
  }>(
    `SELECT user_id AS "userId", access_version AS "accessVersion"
       FROM ${schema}.admin_principals
      WHERE user_id = ANY($1::text[]) ORDER BY user_id`,
    [[ownerId, delegatedId]],
  );
  return result.rows;
}

async function resumeCount() {
  const result = await getDatabasePool().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${schema}.resumes WHERE id = $1`,
    [resumeId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function countConfigurationRevisions() {
  const result = await getDatabasePool().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${schema}.system_config_revisions`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function recoveryAudit() {
  const result = await getDatabasePool().query<{
    actorUserId: string | null;
    targetId: string | null;
    metadata: Record<string, unknown>;
  }>(
    `SELECT actor_user_id AS "actorUserId", target_id AS "targetId", metadata
       FROM ${schema}.admin_audit_events
      WHERE action = 'instance.setup.deactivate'
        AND metadata->>'reason' = $1
      ORDER BY created_at DESC LIMIT 1`,
    [reason],
  );
  return result.rows[0];
}

async function cleanup() {
  const pool = getDatabasePool();
  const users = await pool.query<{ userId: string }>(
    `SELECT principal.user_id AS "userId"
       FROM ${schema}.admin_principals AS principal
       JOIN "user" AS identity ON identity.id = principal.user_id
      WHERE principal.user_id LIKE 'setup-recovery-%'
         OR identity.email = $1`,
    [`replacement-${marker}@example.com`],
  );
  const userIds = users.rows.map((row) => row.userId);
  await pool.query(
    `DELETE FROM ${schema}.admin_audit_events
      WHERE action = 'instance.setup.deactivate'
        AND metadata->>'reason' = $1`,
    [reason],
  );
  await pool.query(`DELETE FROM ${schema}.resumes WHERE id = $1`, [resumeId]);
  if (userIds.length > 0) {
    for (const table of [
      "admin_sessions",
      "admin_recovery_codes",
      "admin_mfa_devices",
      "admin_security_states",
    ]) {
      await pool.query(
        `DELETE FROM ${schema}.${table} WHERE user_id = ANY($1::text[])`,
        [userIds],
      );
    }
    await pool.query(
      `DELETE FROM ${schema}.admin_principals WHERE user_id = ANY($1::text[])`,
      [userIds],
    );
    await pool.query(`DELETE FROM "account" WHERE "userId" = ANY($1::text[])`, [userIds]);
    await pool.query(`DELETE FROM "session" WHERE "userId" = ANY($1::text[])`, [userIds]);
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [userIds]);
  }
  await db.delete(instanceSetupClaimLimits);
  await db.delete(instanceSetupSessions);
  await db.delete(instanceSetupTokens);
  await db.delete(instanceSetupState);
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
