import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const KEY_DERIVATION_SALT = "anonresume-config-v1";

export type ConfigKeyPurpose =
  | "managed-config"
  | "admin-mfa"
  | "ai-credentials";

export interface ConfigKeyring {
  currentKeyId: string;
  keyFor(purpose: ConfigKeyPurpose, keyId?: string): Buffer;
  keysFor(purpose: ConfigKeyPurpose): readonly Buffer[];
}

export interface EncryptedConfigSecret {
  algorithm: "aes-256-gcm";
  authTag: string;
  ciphertext: string;
  iv: string;
  keyId: string;
  version: 1;
}

function assertMasterKey(key: Buffer) {
  if (key.length !== KEY_BYTES) {
    throw new Error("Configuration master key must contain exactly 32 bytes");
  }
}

function keyId(key: Buffer) {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function derivePurposeKey(key: Buffer, purpose: ConfigKeyPurpose) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      key,
      KEY_DERIVATION_SALT,
      `anonresume:${purpose}`,
      KEY_BYTES,
    ),
  );
}

export function createConfigKeyring(input: {
  current: Buffer;
  previous?: Buffer;
}): ConfigKeyring {
  assertMasterKey(input.current);
  if (input.previous) assertMasterKey(input.previous);

  const keys = new Map<string, Buffer>();
  keys.set(keyId(input.current), Buffer.from(input.current));
  if (input.previous) keys.set(keyId(input.previous), Buffer.from(input.previous));
  const currentKeyId = keyId(input.current);

  return {
    currentKeyId,
    keyFor(purpose, requestedKeyId = currentKeyId) {
      const masterKey = keys.get(requestedKeyId);
      if (!masterKey) {
        throw new Error("Configuration secret authentication failed");
      }
      return derivePurposeKey(masterKey, purpose);
    },
    keysFor(purpose) {
      return Object.freeze(
        [...keys.values()].map((masterKey) => derivePurposeKey(masterKey, purpose)),
      );
    },
  };
}

function authenticatedData(
  encrypted: Pick<EncryptedConfigSecret, "keyId" | "version">,
  purpose: ConfigKeyPurpose,
) {
  return Buffer.from(
    `${encrypted.version}:${purpose}:${encrypted.keyId}`,
    "utf8",
  );
}

function decodeCanonicalBase64(value: string) {
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error("invalid base64");
  }
  return decoded;
}

export function encryptConfigSecret(
  plaintext: string,
  keyring: ConfigKeyring,
  purpose: ConfigKeyPurpose,
): EncryptedConfigSecret {
  const iv = randomBytes(IV_BYTES);
  const envelope: EncryptedConfigSecret = {
    algorithm: ALGORITHM,
    authTag: "",
    ciphertext: "",
    iv: iv.toString("base64"),
    keyId: keyring.currentKeyId,
    version: 1,
  };
  const cipher = createCipheriv(
    ALGORITHM,
    keyring.keyFor(purpose),
    iv,
    { authTagLength: AUTH_TAG_BYTES },
  );
  cipher.setAAD(authenticatedData(envelope, purpose));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ...envelope,
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptConfigSecret(
  encrypted: EncryptedConfigSecret,
  keyring: ConfigKeyring,
  purpose: ConfigKeyPurpose,
) {
  try {
    if (encrypted.algorithm !== ALGORITHM || encrypted.version !== 1) {
      throw new Error("unsupported envelope");
    }
    const iv = decodeCanonicalBase64(encrypted.iv);
    const authTag = decodeCanonicalBase64(encrypted.authTag);
    const ciphertext = decodeCanonicalBase64(encrypted.ciphertext);
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error("invalid envelope");
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      keyring.keyFor(purpose, encrypted.keyId),
      iv,
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAAD(authenticatedData(encrypted, purpose));
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Configuration secret authentication failed");
  }
}
