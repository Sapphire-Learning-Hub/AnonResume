import { CONFIG_REGISTRY } from "@/lib/config/registry";
import {
  formatLegacyEnvironmentPlan,
  LEGACY_MANAGED_ENVIRONMENT_KEYS,
  resolveLegacyManagedConfig,
} from "@/lib/config/legacy-environment";

describe("legacy managed environment import", () => {
  it("maps every managed environment key to exactly one registry key", () => {
    const registered = Object.entries(CONFIG_REGISTRY)
      .filter(([, definition]) => definition.environmentKey)
      .map(([, definition]) => definition.environmentKey);

    expect(new Set(registered).size).toBe(registered.length);
    expect(Object.keys(LEGACY_MANAGED_ENVIRONMENT_KEYS).sort()).toEqual(
      [...registered].sort(),
    );
  });

  it("ignores unknown and deployment-only environment keys", () => {
    const resolved = resolveLegacyManagedConfig({
      BETTER_AUTH_SECRET: "deploy-only-secret",
      UNKNOWN_SETTING: "ignored",
      RESUME_VERSION_HISTORY_LIMIT: "8",
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.values).toEqual({ resumeVersionHistoryLimit: 8 });
    expect(resolved.entries).toContainEqual({
      environmentKey: "BETTER_AUTH_SECRET",
      status: "ignored",
    });
    expect(resolved.entries.some((entry) => entry.environmentKey === "UNKNOWN_SETTING"))
      .toBe(false);
  });

  it("rejects partial SMTP and OAuth groups", () => {
    expect(
      resolveLegacyManagedConfig({ SMTP_HOST: "smtp.example.com" }).valid,
    ).toBe(false);
    expect(
      resolveLegacyManagedConfig({ GITHUB_CLIENT_ID: "client-id" }).valid,
    ).toBe(false);
  });

  it("maps standard OTEL metrics environment variables", () => {
    const resolved = resolveLegacyManagedConfig({
      OTEL_METRICS_EXPORTER: "otlp",
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT:
        "http://otel-collector:4318/v1/metrics",
      OTEL_EXPORTER_OTLP_METRICS_HEADERS:
        "authorization=Bearer%20token,x-scope=tenant-a",
      OTEL_METRIC_EXPORT_INTERVAL: "15000",
      OTEL_EXPORTER_OTLP_METRICS_TIMEOUT: "5000",
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.values).toEqual({
      metricsEnabled: true,
      metricsExportIntervalMs: 15_000,
      metricsExportTimeoutMs: 5_000,
      metricsOtlpEndpoint: "http://otel-collector:4318/v1/metrics",
      metricsOtlpHeaders: "authorization=Bearer%20token,x-scope=tenant-a",
    });
  });

  it("rejects enabling OTLP metrics without an endpoint", () => {
    const resolved = resolveLegacyManagedConfig({
      OTEL_METRICS_EXPORTER: "otlp",
    });

    expect(resolved.valid).toBe(false);
    expect(resolved.issues).toContain("metricsOtlpEndpoint:invalid");
  });

  it("formats a dry run without exposing supplied secrets", () => {
    const resolved = resolveLegacyManagedConfig({
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "mailer@example.com",
      SMTP_PASSWORD: "never-print-this",
      EMAIL_FROM: "AnonResume <mailer@example.com>",
    });
    const output = formatLegacyEnvironmentPlan(resolved.entries);

    expect(output).toContain("SMTP_PASSWORD: import");
    expect(output).toContain("SMTP_PORT: missing");
    expect(output).not.toContain("never-print-this");
    expect(output).not.toContain("mailer@example.com");
  });
});
