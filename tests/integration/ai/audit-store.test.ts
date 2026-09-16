import {
  createEncryptedAiAuditEvidence,
  decryptAiAuditEvidence,
} from "@/lib/ai/audit/store";

describe("AI encrypted audit evidence", () => {
  const key = Buffer.alloc(32, 4);

  it("encrypts payloads, hashes exact evidence, and applies retention", () => {
    const now = new Date("2026-09-16T00:00:00.000Z");
    const evidence = createEncryptedAiAuditEvidence({
      request: { prompt: "private resume content" },
      response: { answer: "private model output" },
      encryptionKey: key,
      encryptionKeyVersion: 2,
      retentionDays: 30,
      now,
    });

    expect(evidence.encryptedRequest.toString("utf8")).not.toContain("private");
    expect(evidence.expiresAt.toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(evidence.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(decryptAiAuditEvidence(evidence, key)).toEqual({
      request: { prompt: "private resume content" },
      response: { answer: "private model output" },
    });
  });
});
