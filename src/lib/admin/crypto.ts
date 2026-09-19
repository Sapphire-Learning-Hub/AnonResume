import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { Secret, TOTP } from "otpauth";

import {
  decryptVersionedSecret,
  type VersionedSecretKeys,
} from "@/lib/config/secret-keyring";

const MFA_ALGORITHM = "aes-256-gcm";
const MFA_IV_BYTES = 12;
const TOTP_PERIOD_SECONDS = 30;

export interface EncryptedAdminMfaSecret {
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
}

export function hashAdminSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function generateAdminSessionToken() {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashAdminSecret(rawToken),
  };
}

export function encryptAdminMfaSecret(
  secret: string,
  encryptionKey: Buffer,
): EncryptedAdminMfaSecret {
  if (encryptionKey.length !== 32) {
    throw new Error("Admin MFA encryption key must contain exactly 32 bytes");
  }

  const iv = randomBytes(MFA_IV_BYTES);
  const cipher = createCipheriv(MFA_ALGORITHM, encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedSecret: encrypted.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptAdminMfaSecret(
  encrypted: EncryptedAdminMfaSecret,
  encryptionKey: Buffer,
) {
  if (encryptionKey.length !== 32) {
    throw new Error("Admin MFA encryption key must contain exactly 32 bytes");
  }

  const decipher = createDecipheriv(
    MFA_ALGORITHM,
    encryptionKey,
    Buffer.from(encrypted.encryptionIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.encryptionTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedSecret, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptVersionedAdminMfaSecret(
  encrypted: EncryptedAdminMfaSecret,
  keyVersion: number,
  keys: VersionedSecretKeys,
) {
  return decryptVersionedSecret({
    decrypt: (key) => decryptAdminMfaSecret(encrypted, key),
    keys,
    keyVersion,
  });
}

export function createAdminTotpEnrollment(email: string) {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "AnonResume",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
    secret,
  });

  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export function verifyAdminTotp({
  secret,
  token,
  timestamp = Date.now(),
  lastAcceptedStep,
}: {
  secret: string;
  token: string;
  timestamp?: number;
  lastAcceptedStep?: number | null;
}) {
  if (!/^\d{6}$/.test(token)) return null;

  const totp = new TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token, timestamp, window: 1 });
  if (delta === null) return null;

  const acceptedStep = totp.counter({ timestamp }) + delta;
  if (
    lastAcceptedStep !== undefined &&
    lastAcceptedStep !== null &&
    acceptedStep <= lastAcceptedStep
  ) {
    return null;
  }

  return acceptedStep;
}

export function generateAdminRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const compactCode = randomBytes(10).toString("hex").toUpperCase();
    const rawCode = compactCode.match(/.{1,4}/g)!.join("-");

    return {
      rawCode,
      codeHash: hashAdminSecret(rawCode),
    };
  });
}
