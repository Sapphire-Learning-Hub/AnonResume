import { resolveAiConfiguration } from "@/lib/ai/config/configuration";

describe("AI runtime configuration", () => {
  it("keeps AI disabled and uses bounded defaults without configuration", () => {
    expect(resolveAiConfiguration({})).toMatchObject({
      enabled: false,
      platformEnabled: false,
      byokEnabled: false,
      auditRetentionDays: 30,
      streamCheckpointMs: 1_000,
      runLeaseSeconds: 90,
      requestsPerMinute: 10,
      maxConcurrentRuns: 1,
      defaultMonthlyPoints: 100_000,
    });
  });

  it("requires a canonical base64 32-byte key when AI is enabled", () => {
    expect(() =>
      resolveAiConfiguration({
        AI_ENABLED: "true",
        AI_CREDENTIALS_ENCRYPTION_KEY: "invalid",
      }),
    ).toThrow("AI_CREDENTIALS_ENCRYPTION_KEY");

    const key = Buffer.alloc(32, 9).toString("base64");
    expect(
      resolveAiConfiguration({
        AI_ENABLED: "true",
        AI_PLATFORM_ENABLED: "true",
        AI_BYOK_ENABLED: "true",
        AI_CREDENTIALS_ENCRYPTION_KEY: key,
      }),
    ).toMatchObject({
      enabled: true,
      platformEnabled: true,
      byokEnabled: true,
      credentialsEncryptionKey: Buffer.alloc(32, 9),
    });
  });

  it("rejects invalid booleans and non-positive limits", () => {
    expect(() => resolveAiConfiguration({ AI_ENABLED: "yes" })).toThrow(
      "AI_ENABLED",
    );
    expect(() =>
      resolveAiConfiguration({ AI_AUDIT_RETENTION_DAYS: "0" }),
    ).toThrow("AI_AUDIT_RETENTION_DAYS");
  });
});
