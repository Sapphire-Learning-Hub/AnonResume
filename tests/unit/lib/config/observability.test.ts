import { getManagedConfigDefaults } from "@/lib/config/registry";
import {
  parseMetricsConfiguration,
  validatePublishableManagedConfig,
} from "@/lib/config/observability";

describe("managed metrics configuration", () => {
  it("keeps incomplete settings inert while metrics are disabled", () => {
    const configuration = parseMetricsConfiguration({
      ...getManagedConfigDefaults(),
      metricsEnabled: false,
      metricsOtlpEndpoint: "not-yet-complete",
    });

    expect(configuration).toEqual({ enabled: false });
  });

  it("normalizes a complete OTLP metrics configuration", () => {
    const configuration = parseMetricsConfiguration({
      ...getManagedConfigDefaults(),
      metricsEnabled: true,
      metricsExportIntervalMs: 15_000,
      metricsExportTimeoutMs: 5_000,
      metricsOtlpEndpoint: "http://otel-collector:4318/v1/metrics",
      metricsOtlpHeaders: " Authorization = Bearer%20token , x-scope = tenant-a ",
    });

    expect(configuration).toEqual({
      enabled: true,
      endpoint: "http://otel-collector:4318/v1/metrics",
      exportIntervalMs: 15_000,
      exportTimeoutMs: 5_000,
      headers: {
        authorization: "Bearer%20token",
        "x-scope": "tenant-a",
      },
    });
  });

  it.each([
    "https://user:secret@example.com/v1/metrics",
    "https://example.com/v1/metrics?tenant=a",
    "https://example.com/v1/metrics#fragment",
    "https://example.com/metrics",
    "http://example.com/v1/metrics",
  ])("rejects unsafe enabled endpoint %s", (metricsOtlpEndpoint) => {
    expect(() =>
      validatePublishableManagedConfig({
        ...getManagedConfigDefaults(),
        metricsEnabled: true,
        metricsOtlpEndpoint,
      }),
    ).toThrow("metricsOtlpEndpoint");
  });

  it.each([
    "authorization=one,Authorization=two",
    "host=collector.internal",
    "content-length=12",
    "x-token=first\nsecond",
    "missing-equals",
  ])("rejects unsafe OTLP headers %s", (metricsOtlpHeaders) => {
    expect(() =>
      validatePublishableManagedConfig({
        ...getManagedConfigDefaults(),
        metricsEnabled: true,
        metricsOtlpEndpoint: "https://metrics.example.com/v1/metrics",
        metricsOtlpHeaders,
      }),
    ).toThrow("metricsOtlpHeaders");
  });

  it("rejects export timeouts longer than the export interval", () => {
    expect(() =>
      validatePublishableManagedConfig({
        ...getManagedConfigDefaults(),
        metricsEnabled: true,
        metricsExportIntervalMs: 5_000,
        metricsExportTimeoutMs: 5_001,
        metricsOtlpEndpoint: "https://metrics.example.com/v1/metrics",
      }),
    ).toThrow("metricsExportTimeoutMs");
  });
});
