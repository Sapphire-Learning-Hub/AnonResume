import {
  CONFIG_REGISTRY,
  getManagedConfigDefaults,
} from "@/lib/config/registry";
import {
  parseTracingConfiguration,
  validatePublishableManagedConfig,
} from "@/lib/config/observability";

it("requires valid tracing dependencies only at publication and never publishes credentials", () => {
  const config = { ...getManagedConfigDefaults(), tracingEnabled: true };
  expect(() => validatePublishableManagedConfig(config)).toThrow();
  config.tracingOtlpEndpoint = "http://127.0.0.1:4318/v1/traces";
  config.tracingOtlpHeaders = "authorization=Bearer private-secret";
  expect(parseTracingConfiguration(config)).toMatchObject({
    enabled: true,
    sampleRate: 0.1,
  });
  expect(CONFIG_REGISTRY.tracingOtlpHeaders).toMatchObject({
    public: false,
    sensitive: true,
  });
  for (const endpoint of [
    "https://user:pass@collector.test/v1/traces",
    "https://collector.test/v1/traces?secret=x",
    "http://8.8.8.8/v1/traces",
  ]) {
    expect(() =>
      parseTracingConfiguration({ ...config, tracingOtlpEndpoint: endpoint }),
    ).toThrow();
  }
});
