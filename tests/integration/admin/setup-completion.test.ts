import { randomUUID } from "node:crypto";

import { Secret, TOTP } from "otpauth";

import {
  db,
  getDatabaseSchemaName,
  instanceSetupClaimLimits,
  instanceSetupSessions,
  instanceSetupState,
  instanceSetupTokens,
} from "@/db";
import {
  beginInstanceSetupAccount,
  completeInstanceSetup,
  SetupCompletionError,
} from "@/lib/admin/setup/completion";
import {
  claimInstanceSetupCode,
  requireInstanceSetupSession,
  SetupSessionInvalidError,
} from "@/lib/admin/setup/session";
import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";
import { getDatabasePool } from "@/lib/runtime/database";

const schema = quoteIdentifier(getDatabaseSchemaName());
const emailSuffix = `setup-${randomUUID()}@example.com`;
const password = "long-secure-password";

describe("atomic super-admin setup completion", () => {
  beforeEach(async () => {
    await cleanupSetupFixture();
    await db.insert(instanceSetupState).values({
      slot: 1,
      state: "pending_initialization",
    });
  });

  afterAll(cleanupSetupFixture);

  it("creates one verified super-admin with credentials, MFA and recovery codes", async () => {
    const session = await claimSetupSession("web-new");
    const enrollment = await beginInstanceSetupAccount({
      session,
      name: "Initial Owner",
      email: `new-${emailSuffix}`,
      password,
      deviceName: "Primary authenticator",
    });
    const targetUserId = await setupTargetUserId();

    const completed = await completeInstanceSetup({
      session,
      deviceId: enrollment.deviceId,
      code: currentCode(enrollment.secret),
      password,
    });

    expect(completed.email).toBe(`new-${emailSuffix}`);
    expect(completed.recoveryCodes).toHaveLength(10);
    await expect(activeSuperAdmins()).resolves.toEqual([targetUserId]);
    await expect(setupState()).resolves.toBe("completed");
    await expect(credentialFor(targetUserId!)).resolves.toBeDefined();
    await expect(verifiedMfaDevices(targetUserId!)).resolves.toHaveLength(1);
  });

  it("reuses an abandoned pending identity", async () => {
    const session = await claimSetupSession("web-abandoned");
    await beginInstanceSetupAccount({
      session,
      name: "First Name",
      email: `first-${emailSuffix}`,
      password,
      deviceName: "First device",
    });
    const firstUserId = await setupTargetUserId();

    const restarted = await beginInstanceSetupAccount({
      session,
      name: "Updated Name",
      email: `updated-${emailSuffix}`,
      password,
      deviceName: "Replacement device",
    });

    expect(await setupTargetUserId()).toBe(firstUserId);
    expect(restarted.email).toBe(`updated-${emailSuffix}`);
    await expect(identity(firstUserId!)).resolves.toMatchObject({
      name: "Updated Name",
      email: `updated-${emailSuffix}`,
      emailVerified: false,
    });
  });

  it("reuses the recovery target identity while allowing profile correction", async () => {
    const userId = `recovery-${randomUUID()}`;
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Old Owner', $2, true, now(), now())`,
      [userId, `old-${emailSuffix}`],
    );
    await getDatabasePool().query(
      `INSERT INTO ${schema}.admin_principals
        (user_id, kind, singleton_slot) VALUES ($1, 'super_admin', 1)`,
      [userId],
    );
    for (let index = 0; index < 5; index += 1) {
      await getDatabasePool().query(
        `INSERT INTO ${schema}.admin_mfa_devices
          (user_id, name, encrypted_secret, encryption_iv, encryption_tag,
           key_version, verified_at)
         VALUES ($1, $2, 'retained', 'retained', 'retained', 2, now())`,
        [userId, `Existing device ${index}`],
      );
    }
    await db
      .update(instanceSetupState)
      .set({ state: "pending_admin_recovery", targetUserId: userId })
      .then(() => undefined);
    const session = await claimSetupSession("web-recovery");

    await beginInstanceSetupAccount({
      session,
      name: "Recovered Owner",
      email: `recovered-${emailSuffix}`,
      password,
      deviceName: "Recovery authenticator",
    });

    expect(await setupTargetUserId()).toBe(userId);
    await expect(identity(userId)).resolves.toMatchObject({
      name: "Recovered Owner",
      email: `recovered-${emailSuffix}`,
    });
  });

  it("keeps setup pending and password login unavailable after a wrong TOTP", async () => {
    const session = await claimSetupSession("web-wrong-code");
    const enrollment = await beginInstanceSetupAccount({
      session,
      name: "Pending Owner",
      email: `wrong-${emailSuffix}`,
      password,
      deviceName: "Primary authenticator",
    });
    const userId = await setupTargetUserId();
    const validCode = currentCode(enrollment.secret);

    await expect(
      completeInstanceSetup({
        session,
        deviceId: enrollment.deviceId,
        code: validCode === "000000" ? "000001" : "000000",
        password,
      }),
    ).rejects.toBeInstanceOf(SetupCompletionError);
    await expect(setupState()).resolves.toBe("pending_initialization");
    await expect(credentialFor(userId!)).resolves.toBeUndefined();
    await expect(verifiedMfaDevices(userId!)).resolves.toEqual([]);
  });

  it("rejects completion after the claiming web instance restarts", async () => {
    const session = await claimSetupSession("web-restart");
    const enrollment = await beginInstanceSetupAccount({
      session,
      name: "Restart Owner",
      email: `restart-${emailSuffix}`,
      password,
      deviceName: "Primary authenticator",
    });
    await issueCode("web-restart");

    await expect(
      completeInstanceSetup({
        session,
        deviceId: enrollment.deviceId,
        code: currentCode(enrollment.secret),
        password,
      }),
    ).rejects.toBeInstanceOf(SetupSessionInvalidError);
  });

  it("allows only one concurrent completion", async () => {
    const session = await claimSetupSession("web-concurrent");
    const enrollment = await beginInstanceSetupAccount({
      session,
      name: "Concurrent Owner",
      email: `concurrent-${emailSuffix}`,
      password,
      deviceName: "Primary authenticator",
    });
    const input = {
      session,
      deviceId: enrollment.deviceId,
      code: currentCode(enrollment.secret),
      password,
    };

    const results = await Promise.allSettled([
      completeInstanceSetup(input),
      completeInstanceSetup(input),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(activeSuperAdmins()).resolves.toHaveLength(1);
    await expect(setupState()).resolves.toBe("completed");
  });

  it("rolls back MFA and setup state when credential persistence fails", async () => {
    const session = await claimSetupSession("web-rollback");
    const enrollment = await beginInstanceSetupAccount({
      session,
      name: "Rollback Owner",
      email: `rollback-${emailSuffix}`,
      password,
      deviceName: "Primary authenticator",
    });
    const userId = (await setupTargetUserId())!;
    const triggerName = `fail_setup_${randomUUID().replaceAll("-", "")}`;
    await getDatabasePool().query(
      `CREATE FUNCTION ${triggerName}() RETURNS trigger AS $$
       BEGIN
         IF NEW."accountId" = '${userId}' THEN
           RAISE EXCEPTION 'forced setup credential failure';
         END IF;
         RETURN NEW;
       END;
       $$ LANGUAGE plpgsql;
       CREATE TRIGGER ${triggerName}
       BEFORE INSERT OR UPDATE ON "account"
       FOR EACH ROW EXECUTE FUNCTION ${triggerName}();`,
    );

    try {
      await expect(
        completeInstanceSetup({
          session,
          deviceId: enrollment.deviceId,
          code: currentCode(enrollment.secret),
          password,
        }),
      ).rejects.toThrow("forced setup credential failure");
    } finally {
      await getDatabasePool().query(
        `DROP TRIGGER IF EXISTS ${triggerName} ON "account";
         DROP FUNCTION IF EXISTS ${triggerName}();`,
      );
    }

    await expect(setupState()).resolves.toBe("pending_initialization");
    await expect(credentialFor(userId)).resolves.toBeUndefined();
    await expect(verifiedMfaDevices(userId)).resolves.toEqual([]);
  });
});

async function claimSetupSession(instanceId: string) {
  const issued = await issueCode(instanceId);
  const claimed = await claimInstanceSetupCode(
    issued.rawCode,
    `source-${instanceId}`,
  );
  return requireInstanceSetupSession(
    new Request("http://localhost/setup", {
      headers: { cookie: `anonresume.setup=${claimed.rawSessionToken}` },
    }),
  );
}

async function issueCode(instanceId: string) {
  const result = await initializePendingInstanceSetup({
    identity: { stableId: `production/web/${instanceId}` },
  });
  if (!result.generated) throw new Error("setup code was not generated");
  return result;
}

function currentCode(secret: string) {
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate();
}

async function setupState() {
  const result = await getDatabasePool().query<{ state: string }>(
    `SELECT state FROM ${schema}.instance_setup_state WHERE slot = 1`,
  );
  return result.rows[0]?.state;
}

async function setupTargetUserId() {
  const result = await getDatabasePool().query<{ targetUserId: string | null }>(
    `SELECT target_user_id AS "targetUserId"
       FROM ${schema}.instance_setup_state WHERE slot = 1`,
  );
  return result.rows[0]?.targetUserId ?? null;
}

async function activeSuperAdmins() {
  const result = await getDatabasePool().query<{ userId: string }>(
    `SELECT user_id AS "userId" FROM ${schema}.admin_principals
      WHERE kind = 'super_admin' AND quarantined_at IS NULL`,
  );
  return result.rows.map((row) => row.userId);
}

async function credentialFor(userId: string) {
  const result = await getDatabasePool().query(
    `SELECT id FROM "account"
      WHERE issuer = 'local:credential' AND "accountId" = $1`,
    [userId],
  );
  return result.rows[0];
}

async function verifiedMfaDevices(userId: string) {
  const result = await getDatabasePool().query(
    `SELECT id FROM ${schema}.admin_mfa_devices
      WHERE user_id = $1 AND verified_at IS NOT NULL`,
    [userId],
  );
  return result.rows;
}

async function identity(userId: string) {
  const result = await getDatabasePool().query<{
    name: string;
    email: string;
    emailVerified: boolean;
  }>(
    `SELECT name, email, "emailVerified" FROM "user" WHERE id = $1`,
    [userId],
  );
  return result.rows[0];
}

async function cleanupSetupFixture() {
  const pool = getDatabasePool();
  const principals = await pool.query<{ userId: string }>(
    `SELECT user_id AS "userId" FROM ${schema}.admin_principals
      WHERE kind = 'super_admin'`,
  );
  const userIds = principals.rows.map((row) => row.userId);
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
    await pool.query(`DELETE FROM "account" WHERE "userId" = ANY($1::text[])`, [
      userIds,
    ]);
    await pool.query(`DELETE FROM "session" WHERE "userId" = ANY($1::text[])`, [
      userIds,
    ]);
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
