import type { ConfigKeyPurpose, ConfigKeyring } from "@/lib/config/crypto";

export const LEGACY_SECRET_KEY_VERSION = 1;
export const DERIVED_SECRET_KEY_VERSION = 2;

export interface VersionedSecretKeys {
  current: Buffer;
  legacy?: Buffer;
  previous?: readonly Buffer[];
}

export function createVersionedSecretKeys(input: {
  keyring: ConfigKeyring;
  legacy?: Buffer;
  purpose: ConfigKeyPurpose;
}): VersionedSecretKeys {
  const candidates = input.keyring.keysFor(input.purpose);
  return Object.freeze({
    current: candidates[0]!,
    ...(input.legacy ? { legacy: Buffer.from(input.legacy) } : {}),
    ...(candidates.length > 1
      ? { previous: Object.freeze(candidates.slice(1)) }
      : {}),
  });
}

export function secretKeysForVersion(
  keys: VersionedSecretKeys,
  keyVersion: number,
) {
  if (keyVersion === LEGACY_SECRET_KEY_VERSION) {
    if (!keys.legacy) throw new Error("Legacy secret key is unavailable");
    return [keys.legacy];
  }
  if (keyVersion === DERIVED_SECRET_KEY_VERSION) {
    return [keys.current, ...(keys.previous ?? [])];
  }
  throw new Error(`Unsupported secret key version: ${keyVersion}`);
}

export function decryptVersionedSecret<T>(input: {
  decrypt: (key: Buffer) => T;
  keys: VersionedSecretKeys;
  keyVersion: number;
}) {
  const candidates = secretKeysForVersion(input.keys, input.keyVersion);
  let failure: unknown;
  for (const key of candidates) {
    try {
      return input.decrypt(key);
    } catch (error) {
      failure = error;
    }
  }
  throw failure instanceof Error
    ? failure
    : new Error("Secret authentication failed");
}
