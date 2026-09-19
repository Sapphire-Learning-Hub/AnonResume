import {
  getAiCredentialsEncryptionKey,
  resolveAiConfiguration,
} from "@/lib/ai/config/configuration";
import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { createConfigKeyring } from "@/lib/config/crypto";
import { getManagedConfigDefaults } from "@/lib/config/registry";

describe("AI runtime configuration", () => {
  const encryptionKey = Buffer.alloc(32, 9);

  it("derives disabled AI behavior from managed defaults", () => {
    expect(
      resolveAiConfiguration(getManagedConfigDefaults(), encryptionKey),
    ).toMatchObject({
      enabled: false,
      platformEnabled: false,
      byokEnabled: false,
      auditRetentionDays: 30,
      streamCheckpointMs: 1_000,
      runLeaseSeconds: 90,
      requestsPerMinute: 10,
      maxConcurrentRuns: 1,
      defaultMonthlyPoints: 100_000,
      trustedEndpointHostnames: [],
      credentialsEncryptionKey: encryptionKey,
    });
  });

  it("uses managed switches, trusted hosts, limits, and quota", () => {
    expect(
      resolveAiConfiguration(
        {
          ...getManagedConfigDefaults(),
          aiEnabled: true,
          aiPlatformEnabled: true,
          aiByokEnabled: true,
          aiTrustedEndpointHostnames: [
            "ark.cn-beijing.volces.com",
            "models.example.com",
          ],
          aiAuditRetentionDays: 14,
          aiRequestsPerMinute: 3,
          aiMaxConcurrentRuns: 2,
          aiDefaultMonthlyPoints: 0,
        },
        encryptionKey,
      ),
    ).toMatchObject({
      enabled: true,
      platformEnabled: true,
      byokEnabled: true,
      credentialsEncryptionKey: encryptionKey,
      trustedEndpointHostnames: [
        "ark.cn-beijing.volces.com",
        "models.example.com",
      ],
      auditRetentionDays: 14,
      requestsPerMinute: 3,
      maxConcurrentRuns: 2,
      defaultMonthlyPoints: 0,
    });
  });

  it("returns an immutable request snapshot", () => {
    const configuration = resolveAiConfiguration(
      getManagedConfigDefaults(),
      encryptionKey,
    );

    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.trustedEndpointHostnames)).toBe(true);
  });

  it("derives the credential key from the bootstrap master key", () => {
    const bootstrap = readBootstrapConfig();
    const expected = createConfigKeyring({
      current: bootstrap.currentMasterKey,
      previous: bootstrap.previousMasterKey,
    }).keyFor("ai-credentials");

    expect(getAiCredentialsEncryptionKey()).toEqual(expected);
  });
});
