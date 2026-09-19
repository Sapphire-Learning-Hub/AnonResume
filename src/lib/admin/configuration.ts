type AdminEnvironment = Record<string, string | undefined>;

import { createHash } from "node:crypto";

import type { ManagedConfig } from "@/lib/config/registry";

const DEFAULTS = {
  idleSeconds: 1800,
  maxSeconds: 28_800,
  reauthSeconds: 300,
  maxMfaDevices: 5,
  maxMfaFailures: 5,
  mfaLockSeconds: 900,
} as const;

export function isValidAdminEmail(value: string | undefined) {
  return Boolean(
    value?.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
      value.trim().length <= 254,
  );
}

export function resolveAdminSuperAdminEmail(
  environment: AdminEnvironment,
) {
  const value = environment.ANONRESUME_SUPER_ADMIN_EMAIL?.trim();
  if (!value) return undefined;
  if (!isValidAdminEmail(value)) {
    throw new Error("ANONRESUME_SUPER_ADMIN_EMAIL must be a valid email");
  }

  return value.toLowerCase();
}

export function decodeAdminMfaEncryptionKey(value: string | undefined) {
  if (!value?.trim()) return undefined;

  try {
    const decoded = Buffer.from(value.trim(), "base64");
    const canonical = decoded.toString("base64").replace(/=+$/, "");
    const supplied = value.trim().replace(/=+$/, "");

    return decoded.length === 32 && canonical === supplied ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function getAdminMfaEncryptionKey(environment: AdminEnvironment) {
  const configured = decodeAdminMfaEncryptionKey(
    environment.ADMIN_MFA_ENCRYPTION_KEY,
  );
  if (configured) return configured;

  if (environment.NODE_ENV === "production") {
    throw new Error(
      "ADMIN_MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  }

  return createHash("sha256")
    .update(
      environment.BETTER_AUTH_SECRET ||
        "anonresume-development-admin-mfa-key",
      "utf8",
    )
    .digest();
}

export function resolveAdminSecurityConfiguration(
  configuration: Readonly<ManagedConfig>,
) {
  const idleSeconds = configuration.adminSessionIdleSeconds;
  const maxSeconds = configuration.adminSessionMaxSeconds;
  const reauthSeconds = configuration.adminReauthSeconds;

  if (idleSeconds > maxSeconds) {
    throw new Error(
      "adminSessionIdleSeconds must not exceed adminSessionMaxSeconds",
    );
  }
  if (reauthSeconds > maxSeconds) {
    throw new Error(
      "adminReauthSeconds must not exceed adminSessionMaxSeconds",
    );
  }

  return {
    idleSeconds,
    maxSeconds,
    reauthSeconds,
    maxMfaDevices: DEFAULTS.maxMfaDevices,
    maxMfaFailures: DEFAULTS.maxMfaFailures,
    mfaLockSeconds: DEFAULTS.mfaLockSeconds,
  };
}
