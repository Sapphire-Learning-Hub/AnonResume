import {
  decryptAiCredential,
  decryptVersionedAiCredential,
  encryptAiCredential,
  maskAiCredential,
} from "@/lib/ai/security/credentials";

describe("AI provider credential encryption", () => {
  const key = Buffer.alloc(32, 7);

  it("round trips credentials without storing plaintext", () => {
    const encrypted = encryptAiCredential("sk-sensitive-value", key);

    expect(encrypted.includes(Buffer.from("sk-sensitive-value"))).toBe(false);
    expect(decryptAiCredential(encrypted, key)).toBe("sk-sensitive-value");
  });

  it("rejects wrong keys and corrupt ciphertext", () => {
    const encrypted = encryptAiCredential("secret", key);

    expect(() => decryptAiCredential(encrypted, Buffer.alloc(32, 8))).toThrow();
    expect(() => decryptAiCredential(encrypted.subarray(0, 12), key)).toThrow();
  });

  it("reads legacy and derived credentials by stored key version", () => {
    const legacyKey = Buffer.alloc(32, 6);
    const previousDerivedKey = Buffer.alloc(32, 8);
    const legacy = encryptAiCredential("legacy-secret", legacyKey);
    const previous = encryptAiCredential("previous-secret", previousDerivedKey);
    const keys = {
      current: key,
      previous: [previousDerivedKey],
      legacy: legacyKey,
    };

    expect(decryptVersionedAiCredential(legacy, 1, keys)).toBe(
      "legacy-secret",
    );
    expect(decryptVersionedAiCredential(previous, 2, keys)).toBe(
      "previous-secret",
    );
    expect(() => decryptVersionedAiCredential(legacy, 9, keys)).toThrow(
      "Unsupported secret key version",
    );
  });

  it("validates key length and masks stored values", () => {
    expect(() => encryptAiCredential("secret", Buffer.alloc(16))).toThrow(
      "32 bytes",
    );
    expect(maskAiCredential("sk-1234567890")).toBe("••••7890");
    expect(maskAiCredential("key")).toBe("••••");
    expect(maskAiCredential("1234")).toBe("••••");
  });
});
