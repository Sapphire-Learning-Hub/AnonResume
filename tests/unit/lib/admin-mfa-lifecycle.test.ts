import { randomUUID } from "node:crypto";

import { Secret, TOTP } from "otpauth";

import { getDatabaseSchemaName } from "@/db";
import {
  AdminMfaDeviceConflictError,
  AdminMfaDeviceLimitError,
  AdminMfaLockedError,
  beginAdminMfaEnrollment,
  consumeAdminRecoveryCode,
  getAdminSecuritySummary,
  hasVerifiedAdminMfaDevice,
  removeAdminMfaDevice,
  verifyAdminMfaCode,
  verifyAdminMfaEnrollment,
} from "@/lib/admin-store";
import { getDatabasePool } from "@/lib/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function currentCode(secret: string) {
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate();
}

describe("admin MFA lifecycle", () => {
  const userId = `admin-mfa-${randomUUID()}`;
  const enrollmentLockUserId = `admin-mfa-enrollment-lock-${randomUUID()}`;
  const recoveryLockUserId = `admin-mfa-recovery-lock-${randomUUID()}`;
  const schema = quoteIdentifier(getDatabaseSchemaName());

  beforeAll(async () => {
    for (const id of [userId, enrollmentLockUserId, recoveryLockUserId]) {
      await getDatabasePool().query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, 'MFA test', $2, true, now(), now())`,
        [id, `${id}@example.com`],
      );
      await getDatabasePool().query(
        `INSERT INTO ${schema}.admin_principals (user_id, kind)
         VALUES ($1, 'delegated_admin')`,
        [id],
      );
    }
  });

  afterAll(async () => {
    for (const id of [userId, enrollmentLockUserId, recoveryLockUserId]) {
      for (const table of [
        "admin_sessions",
        "admin_recovery_codes",
        "admin_mfa_devices",
        "admin_security_states",
      ]) {
        await getDatabasePool().query(
          `DELETE FROM ${schema}.${table} WHERE user_id = $1`,
          [id],
        );
      }
      await getDatabasePool().query(
        `DELETE FROM ${schema}.admin_principals WHERE user_id = $1`,
        [id],
      );
      await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [id]);
    }
  });

  it("supports multiple devices but never removes the last verified device", async () => {
    await expect(hasVerifiedAdminMfaDevice(userId)).resolves.toBe(false);
    const first = await beginAdminMfaEnrollment({
      userId,
      email: `${userId}@example.com`,
      name: "Primary",
    });
    const recoveryCodes = await verifyAdminMfaEnrollment({
      userId,
      deviceId: first.deviceId,
      token: currentCode(first.secret),
    });
    expect(recoveryCodes).toHaveLength(10);
    await expect(hasVerifiedAdminMfaDevice(userId)).resolves.toBe(true);
    await expect(
      beginAdminMfaEnrollment({
        userId,
        email: `${userId}@example.com`,
        name: "Unexpected bootstrap device",
        requireNoVerifiedDevices: true,
      }),
    ).rejects.toBeInstanceOf(AdminMfaDeviceConflictError);
    const unexpectedCompletion = await beginAdminMfaEnrollment({
      userId,
      email: `${userId}@example.com`,
      name: "Unexpected completion",
    });
    await expect(
      verifyAdminMfaEnrollment({
        userId,
        deviceId: unexpectedCompletion.deviceId,
        token: currentCode(unexpectedCompletion.secret),
        requireNoVerifiedDevices: true,
      }),
    ).rejects.toBeInstanceOf(AdminMfaDeviceConflictError);
    await expect(removeAdminMfaDevice(userId, first.deviceId)).rejects.toBeInstanceOf(
      AdminMfaDeviceConflictError,
    );

    const second = await beginAdminMfaEnrollment({
      userId,
      email: `${userId}@example.com`,
      name: "Backup",
    });
    await verifyAdminMfaEnrollment({
      userId,
      deviceId: second.deviceId,
      token: currentCode(second.secret),
    });
    await removeAdminMfaDevice(userId, first.deviceId);

    await expect(getAdminSecuritySummary(userId)).resolves.toMatchObject({
      devices: [expect.objectContaining({ id: second.deviceId, name: "Backup" })],
      recoveryCodesRemaining: 10,
    });
    expect(await consumeAdminRecoveryCode(userId, recoveryCodes[0]!)).toBe(true);
    expect(await consumeAdminRecoveryCode(userId, recoveryCodes[0]!)).toBe(false);
    await expect(getAdminSecuritySummary(userId)).resolves.toMatchObject({
      recoveryRequired: true,
      recoveryCodesRemaining: 9,
    });
  });

  it("serially enforces the five-device limit", async () => {
    const existing = (await getAdminSecuritySummary(userId)).devices.length;
    for (let index = existing; index < 5; index += 1) {
      const enrollment = await beginAdminMfaEnrollment({
        userId,
        email: `${userId}@example.com`,
        name: `Device ${index + 1}`,
      });
      await verifyAdminMfaEnrollment({
        userId,
        deviceId: enrollment.deviceId,
        token: currentCode(enrollment.secret),
      });
    }
    await expect(
      beginAdminMfaEnrollment({
        userId,
        email: `${userId}@example.com`,
        name: "Device 6",
      }),
    ).rejects.toBeInstanceOf(AdminMfaDeviceLimitError);
  });

  it("locks management verification after five invalid codes", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        verifyAdminMfaCode({ userId, token: "000000" }),
      ).rejects.toThrow("Invalid management MFA code");
    }
    await expect(
      verifyAdminMfaCode({ userId, token: "000000" }),
    ).rejects.toBeInstanceOf(AdminMfaLockedError);
    await expect(
      verifyAdminMfaCode({ userId, token: "000000" }),
    ).rejects.toBeInstanceOf(AdminMfaLockedError);
  });

  it("locks a pending device enrollment after five invalid codes", async () => {
    const enrollment = await beginAdminMfaEnrollment({
      userId: enrollmentLockUserId,
      email: `${enrollmentLockUserId}@example.com`,
      name: "Primary",
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        verifyAdminMfaEnrollment({
          userId: enrollmentLockUserId,
          deviceId: enrollment.deviceId,
          token: "000000",
        }),
      ).rejects.toThrow("Invalid management MFA code");
    }
    await expect(
      verifyAdminMfaEnrollment({
        userId: enrollmentLockUserId,
        deviceId: enrollment.deviceId,
        token: "000000",
      }),
    ).rejects.toBeInstanceOf(AdminMfaLockedError);
    await expect(
      verifyAdminMfaEnrollment({
        userId: enrollmentLockUserId,
        deviceId: enrollment.deviceId,
        token: currentCode(enrollment.secret),
      }),
    ).rejects.toBeInstanceOf(AdminMfaLockedError);
  });

  it("locks recovery-code verification after five invalid codes", async () => {
    const enrollment = await beginAdminMfaEnrollment({
      userId: recoveryLockUserId,
      email: `${recoveryLockUserId}@example.com`,
      name: "Primary",
    });
    await verifyAdminMfaEnrollment({
      userId: recoveryLockUserId,
      deviceId: enrollment.deviceId,
      token: currentCode(enrollment.secret),
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        consumeAdminRecoveryCode(recoveryLockUserId, "0000-0000-0000-0000-0000"),
      ).resolves.toBe(false);
    }
    await expect(
      consumeAdminRecoveryCode(recoveryLockUserId, "0000-0000-0000-0000-0000"),
    ).rejects.toBeInstanceOf(AdminMfaLockedError);
    await expect(
      consumeAdminRecoveryCode(recoveryLockUserId, "0000-0000-0000-0000-0000"),
    ).rejects.toBeInstanceOf(AdminMfaLockedError);
  });
});
