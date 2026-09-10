import { Secret, TOTP } from "otpauth";

import {
  decryptAdminMfaSecret,
  encryptAdminMfaSecret,
  generateAdminRecoveryCodes,
  generateAdminSessionToken,
  hashAdminSecret,
  verifyAdminTotp,
} from "@/lib/admin/crypto";

const encryptionKey = Buffer.alloc(32, 11);

describe("admin cryptography", () => {
  it("encrypts MFA secrets with authenticated encryption", () => {
    const encrypted = encryptAdminMfaSecret("JBSWY3DPEHPK3PXP", encryptionKey);

    expect(encrypted.encryptedSecret).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptAdminMfaSecret(encrypted, encryptionKey)).toBe(
      "JBSWY3DPEHPK3PXP",
    );
    expect(() =>
      decryptAdminMfaSecret(
        {
          ...encrypted,
          encryptedSecret: `${encrypted.encryptedSecret[0] === "A" ? "B" : "A"}${encrypted.encryptedSecret.slice(1)}`,
        },
        encryptionKey,
      ),
    ).toThrow();
  });

  it("generates high-entropy session tokens and stores only stable hashes", () => {
    const first = generateAdminSessionToken();
    const second = generateAdminSessionToken();

    expect(first.rawToken).not.toBe(second.rawToken);
    expect(first.tokenHash).toBe(hashAdminSecret(first.rawToken));
    expect(first.tokenHash).toHaveLength(64);
  });

  it("rejects a valid TOTP after its time step was already accepted", () => {
    const secret = new Secret({ size: 20 }).base32;
    const timestamp = Date.UTC(2026, 8, 8, 10, 0, 0);
    const token = new TOTP({ secret }).generate({ timestamp });
    const first = verifyAdminTotp({ secret, token, timestamp });

    expect(first).not.toBeNull();
    expect(
      verifyAdminTotp({
        secret,
        token,
        timestamp,
        lastAcceptedStep: first!,
      }),
    ).toBeNull();
  });

  it("creates one-time recovery codes with hash-only persistence values", () => {
    const codes = generateAdminRecoveryCodes(8);

    expect(codes).toHaveLength(8);
    expect(new Set(codes.map((code) => code.rawCode)).size).toBe(8);
    expect(codes.every((code) => code.rawCode.length >= 19)).toBe(true);
    expect(codes.every((code) => code.codeHash.length === 64)).toBe(true);
  });
});
