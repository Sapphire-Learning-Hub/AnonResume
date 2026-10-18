import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

import { applicationMetrics } from "@/lib/observability/metrics/instruments";
import {
  buildMetricsResourceAttributes,
  initializeMetrics,
  shutdownMetrics,
} from "@/lib/observability/metrics/runtime";

afterEach(async () => {
  await shutdownMetrics();
});

describe("metrics runtime", () => {
  it("builds stable resource identity without the process session id", () => {
    expect(
      buildMetricsResourceAttributes({
        environment: "test",
        identity: {
          deploymentId: "deployment-a",
          instanceId: "web-1",
          role: "web",
          sessionId: "must-not-be-exported",
          stableId: "deployment-a/web/web-1",
        },
        serviceVersion: "v2.0.0",
      }),
    ).toEqual({
      "deployment.environment.name": "test",
      "service.deployment.id": "deployment-a",
      "service.instance.id": "web-1",
      "service.name": "anonresume-web",
      "service.namespace": "anonresume",
      "service.version": "v2.0.0",
    });
  });

  it("does not create an exporter when metrics are disabled", async () => {
    let readerCreated = false;
    const runtime = await initializeMetrics({
      configuration: { enabled: false },
      environment: "test",
      identity: {
        deploymentId: "deployment-a",
        instanceId: "web-1",
        role: "web",
        sessionId: "session-a",
        stableId: "deployment-a/web/web-1",
      },
      readerFactory() {
        readerCreated = true;
        throw new Error("reader must not be created");
      },
      serviceVersion: "v2.0.0",
    });

    applicationMetrics.recordHttpRequestStarted({
      method: "GET",
      routePattern: "/api/health/live",
    });
    expect(runtime.enabled).toBe(false);
    expect(readerCreated).toBe(false);
  });

  it("fails closed when the metrics reader cannot be created", async () => {
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
        throw new Error("collector setup failed");
      },
      serviceVersion: "v2.0.0",
    });

    expect(runtime.enabled).toBe(false);
  });

  it("initializes one provider per process", async () => {
    const exporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE,
    );
    let readers = 0;
    const options = {
      configuration: {
        enabled: true as const,
        endpoint: "http://otel-collector:4318/v1/metrics",
        exportIntervalMs: 60_000,
        exportTimeoutMs: 10_000,
        headers: {},
      },
      environment: "test",
      identity: {
        deploymentId: "deployment-a",
        instanceId: "web-1",
        role: "web" as const,
        sessionId: "session-a",
        stableId: "deployment-a/web/web-1",
      },
      readerFactory() {
        readers += 1;
        return new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: 60_000,
          exportTimeoutMillis: 10_000,
        });
      },
      serviceVersion: "v2.0.0",
    };

    const first = await initializeMetrics(options);
    const second = await initializeMetrics(options);

    expect(second).toBe(first);
    expect(readers).toBe(1);
  });

  it("exports application metrics with stable resource attributes", async () => {
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
        sessionId: "must-not-be-exported",
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

    applicationMetrics.recordHttpRequestStarted({
      method: "GET",
      routePattern: "/api/health/live",
    });
    applicationMetrics.recordHttpRequestCompleted({
      durationSeconds: 0.025,
      method: "GET",
      outcome: "success",
      routePattern: "/api/health/live",
      statusCode: 200,
    });
    await runtime.forceFlush();

    const exported = exporter.getMetrics().at(-1);
    expect(exported?.resource.attributes).toMatchObject({
      "deployment.environment.name": "test",
      "service.deployment.id": "deployment-a",
      "service.instance.id": "web-1",
      "service.name": "anonresume-web",
      "service.namespace": "anonresume",
      "service.version": "v2.0.0",
    });
    expect(exported?.resource.attributes).not.toHaveProperty(
      "service.session.id",
    );
    const names = exported?.scopeMetrics.flatMap((scope) =>
      scope.metrics.map((metric) => metric.descriptor.name)
    );
    expect(names).toEqual(expect.arrayContaining([
      "anonresume.http.server.requests",
      "anonresume.http.server.active_requests",
      "anonresume.http.server.request.duration",
    ]));
    const activeMetric = exported?.scopeMetrics
      .flatMap((scope) => scope.metrics)
      .find(
        (metric) =>
          metric.descriptor.name === "anonresume.http.server.active_requests",
      );
    expect(activeMetric?.dataPoints).toEqual([
      expect.objectContaining({
        attributes: {
          "http.request.method": "GET",
          "http.route": "/api/health/live",
        },
        value: 0,
      }),
    ]);
  });
});
