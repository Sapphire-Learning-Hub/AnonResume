import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import {
  decryptVersionedSecret,
  type VersionedSecretKeys,
} from "@/lib/config/secret-keyring";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function assertKey(key: Buffer) {
  if (key.length !== 32) {
    throw new Error("AI credential encryption key must contain exactly 32 bytes");
  }
}

export function encryptAiCredential(secret: string, key: Buffer) {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptAiCredential(encrypted: Buffer, key: Buffer) {
  assertKey(key);
  if (encrypted.length <= IV_BYTES + AUTH_TAG_BYTES) {
    throw new Error("AI credential ciphertext is invalid");
  }

  const iv = encrypted.subarray(0, IV_BYTES);
  const tag = encrypted.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = encrypted.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptVersionedAiCredential(
  encrypted: Buffer,
  keyVersion: number,
  keys: VersionedSecretKeys,
) {
  return decryptVersionedSecret({
    decrypt: (key) => decryptAiCredential(encrypted, key),
    keys,
    keyVersion,
  });
}

export function maskAiCredential(secret: string) {
  if (secret.length <= 4) return "••••";
  return `••••${secret.slice(-4)}`;
}
