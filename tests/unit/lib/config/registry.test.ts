import {
  CONFIG_REGISTRY,
  getManagedConfigDefaults,
  parseManagedConfig,
} from "@/lib/config/registry";

describe("managed configuration registry", () => {
  it("rejects cross-field PDF limits", () => {
    expect(() =>
      parseManagedConfig({
        pdfMaxConcurrency: 10,
        pdfQueueLimit: 2,
        pdfMaxActivePerUser: 3,
      }),
    ).toThrow("pdfMaxConcurrency");
  });

  it("marks secrets, restart settings, and consumers explicitly", () => {
    expect(CONFIG_REGISTRY.smtpPassword.sensitive).toBe(true);
    expect(CONFIG_REGISTRY.smtpPassword.applyMode).toBe("restart");
    expect(CONFIG_REGISTRY.aiRequestsPerMinute.consumers).toContain(
      "ai-worker",
    );
    expect(CONFIG_REGISTRY.sourceCodeUrl.public).toBe(true);
  });

  it("builds a complete safe snapshot from defaults and partial input", () => {
    const defaults = getManagedConfigDefaults();
    const configuration = parseManagedConfig({
      aiDefaultMonthlyPoints: 0,
      pdfQueueLimit: 50,
    });

    expect(configuration.aiEnabled).toBe(false);
    expect(configuration.aiDefaultMonthlyPoints).toBe(0);
    expect(configuration.pdfQueueLimit).toBe(50);
    expect(configuration.smtpPassword).toBe(defaults.smtpPassword);
  });

  it("rejects incomplete external-service groups", () => {
    expect(() => parseManagedConfig({ smtpHost: "smtp.example.com" })).toThrow(
      "smtpUser",
    );
    expect(() => parseManagedConfig({ githubClientId: "client-id" })).toThrow(
      "githubClientSecret",
    );
  });

  it("enforces AI worker operating bounds", () => {
    expect(() => parseManagedConfig({ aiWorkerBatchSize: 1_001 })).toThrow(
      "aiWorkerBatchSize",
    );
    expect(() => parseManagedConfig({ aiWorkerPollIntervalMs: 249 })).toThrow(
      "aiWorkerPollIntervalMs",
    );
    expect(() =>
      parseManagedConfig({ aiWorkerRecoveryIntervalMs: 3_600_001 }),
    ).toThrow("aiWorkerRecoveryIntervalMs");
    expect(() =>
      parseManagedConfig({ aiWorkerRetentionIntervalMs: 86_400_001 }),
    ).toThrow("aiWorkerRetentionIntervalMs");
  });
});
