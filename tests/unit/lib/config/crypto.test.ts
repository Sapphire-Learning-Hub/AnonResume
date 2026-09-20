import {
  createConfigKeyring,
  decryptConfigSecret,
  encryptConfigSecret,
} from "@/lib/config/crypto";

const current = Buffer.alloc(32, 7);
const previous = Buffer.alloc(32, 3);

describe("configuration encryption keyring", () => {
  it("derives isolated purpose keys", () => {
    const keyring = createConfigKeyring({ current, previous });

    expect(
      keyring
        .keyFor("managed-config")
        .equals(keyring.keyFor("ai-credentials")),
    ).toBe(false);
  });

  it("decrypts previous-key payloads during rotation", () => {
    const oldKeyring = createConfigKeyring({ current: previous });
    const rotatingKeyring = createConfigKeyring({ current, previous });
    const encrypted = encryptConfigSecret(
      "smtp-secret",
      oldKeyring,
      "managed-config",
    );

    expect(
      decryptConfigSecret(encrypted, rotatingKeyring, "managed-config"),
    ).toBe("smtp-secret");
  });

  it("rejects tampering without returning partial plaintext", () => {
    const keyring = createConfigKeyring({ current, previous });
    const encrypted = encryptConfigSecret(
      "private",
      keyring,
      "managed-config",
    );
    encrypted.ciphertext = `${encrypted.ciphertext}A`;

    expect(() =>
      decryptConfigSecret(encrypted, keyring, "managed-config"),
    ).toThrow("authentication");
  });

  it("binds encrypted values to their declared purpose", () => {
    const keyring = createConfigKeyring({ current, previous });
    const encrypted = encryptConfigSecret(
      "private",
      keyring,
      "managed-config",
    );

    expect(() =>
      decryptConfigSecret(encrypted, keyring, "admin-mfa"),
    ).toThrow("authentication");
  });

  it("rejects invalid master key lengths", () => {
    expect(() => createConfigKeyring({ current: Buffer.alloc(31) })).toThrow(
      "32 bytes",
    );
  });
});
