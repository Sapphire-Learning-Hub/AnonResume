import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

describe("metrics process registry", () => {
  it("records route metrics across isolated Next.js module graphs", async () => {
    const { initializeMetrics } = await import(
      "@/lib/observability/metrics/runtime"
    );
    const exporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE,
    );
    const runtime = await initializeMetrics({
      configuration: {
        enabled: true,
        endpoint: "http://otel-collector:4318/v1/metrics",
        exportIntervalMs: 60_000,
        exportTimeoutMs: 10_000,
        headers: {},
      },
      environment: "test",
      identity: {
        deploymentId: "deployment-a",
        instanceId: "web-1",
        role: "web",
        sessionId: "session-a",
        stableId: "deployment-a/web/web-1",
      },
      readerFactory() {
        return new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: 60_000,
          exportTimeoutMillis: 10_000,
        });
      },
      serviceVersion: "v2.0.0",
    });

    vi.resetModules();
    const { applicationMetrics: routeMetrics } = await import(
      "@/lib/observability/metrics/instruments"
    );
    routeMetrics.recordHttpRequestCompleted({
      durationSeconds: 0.025,
      method: "GET",
      outcome: "success",
      routePattern: "/api/health/live",
      statusCode: 200,
    });
    await runtime.forceFlush();

    const names = exporter.getMetrics().at(-1)?.scopeMetrics.flatMap((scope) =>
      scope.metrics.map((metric) => metric.descriptor.name)
    );
    expect(names).toContain("anonresume.http.server.requests");

    await runtime.shutdown();
  });
});
