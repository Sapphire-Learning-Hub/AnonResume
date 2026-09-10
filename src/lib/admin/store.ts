import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { PoolClient } from "pg";

import {
  accountRestrictions,
  adminAssignments,
  adminMfaDevices,
  adminPrincipals,
  adminRoles,
  adminSecurityStates,
  adminSessions,
  db,
  getDatabaseSchemaName,
} from "@/db";

import {
  type AdminAuthorizationStore,
  type StoredAdminAccess,
} from "@/lib/admin/authorization";
import {
  getAdminMfaEncryptionKey,
  resolveAdminSecurityConfiguration,
} from "@/lib/admin/configuration";
import {
  createAdminTotpEnrollment,
  decryptAdminMfaSecret,
  encryptAdminMfaSecret,
  generateAdminRecoveryCodes,
  generateAdminSessionToken,
  hashAdminSecret,
  verifyAdminTotp,
} from "@/lib/admin/crypto";
import {
  ADMIN_PERMISSION_KEYS,
  normalizeAdminPermissions,
} from "@/lib/admin/permissions";
import { getDatabasePool } from "@/lib/runtime/database";

export class AdminMfaLockedError extends Error {
  constructor(public readonly lockedUntil: Date) {
    super("Management MFA verification is temporarily locked");
    this.name = "AdminMfaLockedError";
  }
}

export class AdminMfaVerificationError extends Error {
  constructor() {
    super("Invalid management MFA code");
    this.name = "AdminMfaVerificationError";
  }
}

export class AdminMfaDeviceLimitError extends Error {
  constructor() {
    super("At most five management MFA devices may be registered");
    this.name = "AdminMfaDeviceLimitError";
  }
}

export class AdminMfaDeviceConflictError extends Error {
  constructor(message = "The management MFA device cannot be changed") {
    super(message);
    this.name = "AdminMfaDeviceConflictError";
  }
}

const MAX_ADMIN_MFA_DEVICES = 5;

type AdminMfaSecurityState = {
  failedAttempts: number;
  lockedUntil: Date | null;
  recoveryRequired: boolean;
};

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function lockAdminMfaSecurityState({
  client,
  schema,
  userId,
  now,
}: {
  client: PoolClient;
  schema: string;
  userId: string;
  now: Date;
}) {
  await client.query(
    `INSERT INTO ${schema}.admin_security_states (user_id)
     VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  const result = await client.query<AdminMfaSecurityState>(
    `SELECT failed_attempts AS "failedAttempts",
            locked_until AS "lockedUntil",
            recovery_required AS "recoveryRequired"
       FROM ${schema}.admin_security_states
      WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  const state = result.rows[0]!;
  if (state.lockedUntil && state.lockedUntil > now) {
    throw new AdminMfaLockedError(state.lockedUntil);
  }
  return state;
}

async function recordAdminMfaFailure({
  client,
  schema,
  userId,
  failedAttempts,
  now,
}: {
  client: PoolClient;
  schema: string;
  userId: string;
  failedAttempts: number;
  now: Date;
}) {
  const config = resolveAdminSecurityConfiguration(process.env);
  const attempts = failedAttempts + 1;
  const lockedUntil =
    attempts >= config.maxMfaFailures
      ? new Date(now.getTime() + config.mfaLockSeconds * 1000)
      : null;
  await client.query(
    `UPDATE ${schema}.admin_security_states
        SET failed_attempts = $2, locked_until = $3, updated_at = $4
      WHERE user_id = $1`,
    [userId, lockedUntil ? 0 : attempts, lockedUntil, now],
  );
  return lockedUntil;
}

async function clearAdminMfaFailures({
  client,
  schema,
  userId,
  now,
}: {
  client: PoolClient;
  schema: string;
  userId: string;
  now: Date;
}) {
  await client.query(
    `UPDATE ${schema}.admin_security_states
        SET failed_attempts = 0, locked_until = NULL, updated_at = $2
      WHERE user_id = $1`,
    [userId, now],
  );
}

export async function getAdminAccessForUser(
  userId: string,
): Promise<StoredAdminAccess | null> {
  const restriction = await db
    .select({ suspendedUntil: accountRestrictions.suspendedUntil })
    .from(accountRestrictions)
    .where(eq(accountRestrictions.userId, userId))
    .limit(1);
  if (
    restriction[0] &&
    (!restriction[0].suspendedUntil || restriction[0].suspendedUntil > new Date())
  ) {
    return null;
  }

  const rows = await db
    .select({
      kind: adminPrincipals.kind,
      rolePermissions: adminRoles.permissions,
      accessVersion: adminPrincipals.accessVersion,
      recoveryRequired: adminSecurityStates.recoveryRequired,
    })
    .from(adminPrincipals)
    .leftJoin(
      adminAssignments,
      eq(adminAssignments.userId, adminPrincipals.userId),
    )
    .leftJoin(adminRoles, eq(adminRoles.id, adminAssignments.roleId))
    .leftJoin(
      adminSecurityStates,
      eq(adminSecurityStates.userId, adminPrincipals.userId),
    )
    .where(
      and(
        eq(adminPrincipals.userId, userId),
        isNull(adminPrincipals.quarantinedAt),
      ),
    );
  const row = rows[0];

  if (!row || row.kind === "quarantined_admin") return null;
  if (row.kind === "super_admin") {
    return {
      kind: "super_admin",
      accessVersion: row.accessVersion,
      permissions: [...ADMIN_PERMISSION_KEYS],
      recoveryRequired: row.recoveryRequired ?? false,
    };
  }
  const assignedPermissions = rows.flatMap((item) =>
    normalizeAdminPermissions(item.rolePermissions),
  );
  if (assignedPermissions.length === 0) return null;
  const permissionSet = new Set(assignedPermissions);

  return {
    kind: "delegated_admin",
    accessVersion: row.accessVersion,
    permissions: ADMIN_PERMISSION_KEYS.filter((permission) =>
      permissionSet.has(permission),
    ),
    recoveryRequired: row.recoveryRequired ?? false,
  };
}

export async function isManagementOnlyIdentity(userId: string) {
  const access = await getAdminAccessForUser(userId);
  return access?.kind === "super_admin";
}

export async function isAccountSuspended(userId: string) {
  const rows = await db
    .select({ suspendedUntil: accountRestrictions.suspendedUntil })
    .from(accountRestrictions)
    .where(eq(accountRestrictions.userId, userId))
    .limit(1);
  return Boolean(
    rows[0] && (!rows[0].suspendedUntil || rows[0].suspendedUntil > new Date()),
  );
}

export class PostgresAdminAuthorizationStore
  implements AdminAuthorizationStore
{
  async findSessionByTokenHash(tokenHash: string) {
    const rows = await db
      .select({
        id: adminSessions.id,
        userId: adminSessions.userId,
        baseSessionId: adminSessions.baseSessionId,
        accessVersion: adminSessions.accessVersion,
        idleExpiresAt: adminSessions.idleExpiresAt,
        absoluteExpiresAt: adminSessions.absoluteExpiresAt,
        reauthenticatedAt: adminSessions.reauthenticatedAt,
        revokedAt: adminSessions.revokedAt,
      })
      .from(adminSessions)
      .where(eq(adminSessions.tokenHash, tokenHash))
      .limit(1);
    return rows[0] ?? null;
  }

  getAccess(userId: string) {
    return getAdminAccessForUser(userId);
  }

  async touchSession(
    sessionId: string,
    input: { lastSeenAt: Date; idleExpiresAt: Date },
  ) {
    await db
      .update(adminSessions)
      .set(input)
      .where(and(eq(adminSessions.id, sessionId), isNull(adminSessions.revokedAt)));
  }
}

export async function createAdminSession({
  userId,
  baseSessionId,
  mfaDeviceId,
  now = new Date(),
}: {
  userId: string;
  baseSessionId: string;
  mfaDeviceId: string | null;
  now?: Date;
}) {
  const access = await getAdminAccessForUser(userId);
  if (!access) throw new Error("Management access is not assigned");

  const config = resolveAdminSecurityConfiguration(process.env);
  const { rawToken, tokenHash } = generateAdminSessionToken();
  const absoluteExpiresAt = new Date(now.getTime() + config.maxSeconds * 1000);
  const idleExpiresAt = new Date(
    Math.min(
      now.getTime() + config.idleSeconds * 1000,
      absoluteExpiresAt.getTime(),
    ),
  );

  await db.insert(adminSessions).values({
    userId,
    baseSessionId,
    mfaDeviceId,
    tokenHash,
    accessVersion: access.accessVersion,
    lastSeenAt: now,
    idleExpiresAt,
    absoluteExpiresAt,
    reauthenticatedAt: now,
  });

  return { rawToken, idleExpiresAt, absoluteExpiresAt };
}

export async function revokeAdminSessionsForUser(userId: string) {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.userId, userId), isNull(adminSessions.revokedAt)));
}

export async function revokeAdminSessionByToken(rawToken: string) {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(adminSessions.tokenHash, hashAdminSecret(rawToken)),
        isNull(adminSessions.revokedAt),
      ),
    );
}

export async function reauthenticateAdminSession({
  adminSessionId,
  userId,
  code,
  now = new Date(),
}: {
  adminSessionId: string;
  userId: string;
  code: string;
  now?: Date;
}) {
  const mfaDeviceId = await verifyAdminMfaCode({ userId, token: code, now });
  const result = await db
    .update(adminSessions)
    .set({ mfaDeviceId, reauthenticatedAt: now })
    .where(
      and(
        eq(adminSessions.id, adminSessionId),
        eq(adminSessions.userId, userId),
        isNull(adminSessions.revokedAt),
      ),
    )
    .returning({ id: adminSessions.id });
  if (result.length !== 1) throw new Error("Management session is unavailable");
}

export async function beginAdminMfaEnrollment({
  userId,
  email,
  name,
  requireNoVerifiedDevices = false,
}: {
  userId: string;
  email: string;
  name: string;
  requireNoVerifiedDevices?: boolean;
}) {
  const enrollment = createAdminTotpEnrollment(email);
  const encrypted = encryptAdminMfaSecret(
    enrollment.secret,
    getAdminMfaEncryptionKey(process.env),
  );
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('admin-mfa:' || $1))`,
      [userId],
    );
    const countResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM ${schema}.admin_mfa_devices
        WHERE user_id = $1 AND verified_at IS NOT NULL`,
      [userId],
    );
    const verifiedDeviceCount = Number(countResult.rows[0]?.count);
    if (requireNoVerifiedDevices && verifiedDeviceCount !== 0) {
      throw new AdminMfaDeviceConflictError(
        "A verified management MFA device already exists",
      );
    }
    if (verifiedDeviceCount >= MAX_ADMIN_MFA_DEVICES) {
      throw new AdminMfaDeviceLimitError();
    }
    await client.query(
      `DELETE FROM ${schema}.admin_mfa_devices
        WHERE user_id = $1 AND verified_at IS NULL`,
      [userId],
    );
    const result = await client.query<{ id: string }>(
      `INSERT INTO ${schema}.admin_mfa_devices
        (user_id, name, encrypted_secret, encryption_iv, encryption_tag, key_version)
       VALUES ($1, $2, $3, $4, $5, 1) RETURNING id::text`,
      [
        userId,
        name.trim() || "验证器",
        encrypted.encryptedSecret,
        encrypted.encryptionIv,
        encrypted.encryptionTag,
      ],
    );
    await client.query("COMMIT");
    return {
      deviceId: result.rows[0]!.id,
      uri: enrollment.uri,
      secret: enrollment.secret,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      throw new AdminMfaDeviceConflictError("An MFA device with this name already exists");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyAdminMfaCode({
  userId,
  token,
  now = new Date(),
}: {
  userId: string;
  token: string;
  now?: Date;
}) {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();

  try {
    await client.query("BEGIN");
    const security = await lockAdminMfaSecurityState({
      client,
      schema,
      userId,
      now,
    });

    const deviceResult = await client.query<{
      id: string;
      encryptedSecret: string;
      encryptionIv: string;
      encryptionTag: string;
      lastAcceptedStep: string | number | null;
    }>(
      `SELECT id, encrypted_secret AS "encryptedSecret",
              encryption_iv AS "encryptionIv", encryption_tag AS "encryptionTag",
              last_accepted_step AS "lastAcceptedStep"
         FROM ${schema}.admin_mfa_devices
        WHERE user_id = $1 AND verified_at IS NOT NULL
        ORDER BY created_at ASC FOR UPDATE`,
      [userId],
    );

    let accepted: { deviceId: string; step: number } | null = null;
    for (const device of deviceResult.rows) {
      const secret = decryptAdminMfaSecret(
        device,
        getAdminMfaEncryptionKey(process.env),
      );
      const step = verifyAdminTotp({
        secret,
        token,
        timestamp: now.getTime(),
        lastAcceptedStep:
          device.lastAcceptedStep === null
            ? null
            : Number(device.lastAcceptedStep),
      });
      if (step !== null) {
        accepted = { deviceId: device.id, step };
        break;
      }
    }

    if (!accepted) {
      const lockedUntil = await recordAdminMfaFailure({
        client,
        schema,
        userId,
        failedAttempts: security.failedAttempts,
        now,
      });
      await client.query("COMMIT");
      if (lockedUntil) throw new AdminMfaLockedError(lockedUntil);
      throw new AdminMfaVerificationError();
    }

    await client.query(
      `UPDATE ${schema}.admin_mfa_devices
          SET last_accepted_step = $2, last_used_at = $3
        WHERE id = $1`,
      [accepted.deviceId, accepted.step, now],
    );
    await clearAdminMfaFailures({ client, schema, userId, now });
    await client.query("COMMIT");
    return accepted.deviceId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyAdminMfaEnrollment({
  userId,
  deviceId,
  token,
  requireNoVerifiedDevices = false,
  now = new Date(),
}: {
  userId: string;
  deviceId: string;
  token: string;
  requireNoVerifiedDevices?: boolean;
  now?: Date;
}) {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const security = await lockAdminMfaSecurityState({
      client,
      schema,
      userId,
      now,
    });
    if (requireNoVerifiedDevices) {
      const verifiedDeviceResult = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM ${schema}.admin_mfa_devices
          WHERE user_id = $1 AND verified_at IS NOT NULL`,
        [userId],
      );
      if (Number(verifiedDeviceResult.rows[0]?.count) !== 0) {
        throw new AdminMfaDeviceConflictError(
          "A verified management MFA device already exists",
        );
      }
    }
    const deviceResult = await client.query<{
      encryptedSecret: string;
      encryptionIv: string;
      encryptionTag: string;
    }>(
      `SELECT encrypted_secret AS "encryptedSecret",
              encryption_iv AS "encryptionIv", encryption_tag AS "encryptionTag"
         FROM ${schema}.admin_mfa_devices
        WHERE id = $1 AND user_id = $2 AND verified_at IS NULL
        FOR UPDATE`,
      [deviceId, userId],
    );
    const device = deviceResult.rows[0];
    const step = device
      ? verifyAdminTotp({
          secret: decryptAdminMfaSecret(
            device,
            getAdminMfaEncryptionKey(process.env),
          ),
          token,
          timestamp: now.getTime(),
        })
      : null;
    if (step === null) {
      const lockedUntil = await recordAdminMfaFailure({
        client,
        schema,
        userId,
        failedAttempts: security.failedAttempts,
        now,
      });
      await client.query("COMMIT");
      if (lockedUntil) throw new AdminMfaLockedError(lockedUntil);
      throw new AdminMfaVerificationError();
    }

    const recoveryCodes = generateAdminRecoveryCodes();
    const updated = await client.query(
      `UPDATE ${schema}.admin_mfa_devices
          SET verified_at = $3, last_accepted_step = $4, last_used_at = $3
        WHERE id = $1 AND user_id = $2 AND verified_at IS NULL
        RETURNING id`,
      [deviceId, userId, now, step],
    );
    if (updated.rowCount !== 1) throw new AdminMfaVerificationError();

    const countResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${schema}.admin_mfa_devices
        WHERE user_id = $1 AND verified_at IS NOT NULL`,
      [userId],
    );
    const shouldRegenerateRecoveryCodes =
      Number(countResult.rows[0]?.count) === 1 ||
      security.recoveryRequired;
    if (shouldRegenerateRecoveryCodes) {
      await client.query(
        `DELETE FROM ${schema}.admin_recovery_codes WHERE user_id = $1`,
        [userId],
      );
      for (const recoveryCode of recoveryCodes) {
        await client.query(
          `INSERT INTO ${schema}.admin_recovery_codes (user_id, code_hash)
           VALUES ($1, $2)`,
          [userId, recoveryCode.codeHash],
        );
      }
      await client.query(
        `UPDATE ${schema}.admin_security_states
            SET recovery_required = false, updated_at = $2
          WHERE user_id = $1`,
        [userId, now],
      );
    }
    await clearAdminMfaFailures({ client, schema, userId, now });
    await client.query("COMMIT");
    return shouldRegenerateRecoveryCodes
      ? recoveryCodes.map((code) => code.rawCode)
      : [];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function consumeAdminRecoveryCode(
  userId: string,
  rawCode: string,
  now = new Date(),
) {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const security = await lockAdminMfaSecurityState({
      client,
      schema,
      userId,
      now,
    });
    const result = await client.query(
      `UPDATE ${schema}.admin_recovery_codes
          SET used_at = $3
        WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
        RETURNING id`,
      [userId, hashAdminSecret(rawCode.trim().toUpperCase()), now],
    );
    if (result.rowCount !== 1) {
      const lockedUntil = await recordAdminMfaFailure({
        client,
        schema,
        userId,
        failedAttempts: security.failedAttempts,
        now,
      });
      await client.query("COMMIT");
      if (lockedUntil) throw new AdminMfaLockedError(lockedUntil);
      return false;
    }
    await client.query(
      `UPDATE ${schema}.admin_security_states
          SET recovery_required = true, failed_attempts = 0,
              locked_until = NULL, updated_at = $2
        WHERE user_id = $1`,
      [userId, now],
    );
    await client.query(
      `UPDATE ${schema}.admin_sessions SET revoked_at = $2
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, now],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminMfaDevices(userId: string) {
  return db
    .select({
      id: adminMfaDevices.id,
      name: adminMfaDevices.name,
      createdAt: adminMfaDevices.createdAt,
      lastUsedAt: adminMfaDevices.lastUsedAt,
    })
    .from(adminMfaDevices)
    .where(
      and(
        eq(adminMfaDevices.userId, userId),
        isNotNull(adminMfaDevices.verifiedAt),
      ),
    )
    .orderBy(adminMfaDevices.createdAt);
}

export async function hasVerifiedAdminMfaDevice(userId: string) {
  const devices = await db
    .select({ id: adminMfaDevices.id })
    .from(adminMfaDevices)
    .where(
      and(
        eq(adminMfaDevices.userId, userId),
        isNotNull(adminMfaDevices.verifiedAt),
      ),
    )
    .limit(1);
  return devices.length !== 0;
}

export async function getAdminSecuritySummary(userId: string) {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const [devices, state] = await Promise.all([
    listAdminMfaDevices(userId),
    getDatabasePool().query<{
      recoveryRequired: boolean;
      recoveryCodesRemaining: number;
    }>(
      `SELECT
        coalesce((SELECT recovery_required
          FROM ${schema}.admin_security_states WHERE user_id = $1), false)
          AS "recoveryRequired",
        (SELECT count(*)::int FROM ${schema}.admin_recovery_codes
          WHERE user_id = $1 AND used_at IS NULL) AS "recoveryCodesRemaining"`,
      [userId],
    ),
  ]);
  return {
    devices,
    recoveryRequired: state.rows[0]?.recoveryRequired ?? false,
    recoveryCodesRemaining: state.rows[0]?.recoveryCodesRemaining ?? 0,
  };
}

export async function removeAdminMfaDevice(userId: string, deviceId: string) {
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('admin-mfa:' || $1))`,
      [userId],
    );
    const devices = await client.query<{ id: string; name: string }>(
      `SELECT id::text, name FROM ${schema}.admin_mfa_devices
        WHERE user_id = $1 AND verified_at IS NOT NULL FOR UPDATE`,
      [userId],
    );
    if (!devices.rows.some((device) => device.id === deviceId)) {
      throw new AdminMfaDeviceConflictError("MFA device not found");
    }
    if (devices.rows.length <= 1) {
      throw new AdminMfaDeviceConflictError("The last MFA device cannot be removed");
    }
    await client.query(
      `DELETE FROM ${schema}.admin_mfa_devices WHERE id = $1 AND user_id = $2`,
      [deviceId, userId],
    );
    await client.query("COMMIT");
    return devices.rows.find((device) => device.id === deviceId)!;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
