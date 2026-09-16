import {
  decryptAiCredential,
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

  it("validates key length and masks stored values", () => {
    expect(() => encryptAiCredential("secret", Buffer.alloc(16))).toThrow(
      "32 bytes",
    );
    expect(maskAiCredential("sk-1234567890")).toBe("••••7890");
  });
});
