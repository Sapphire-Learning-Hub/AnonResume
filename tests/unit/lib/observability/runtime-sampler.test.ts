import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { afterEach, expect, it } from "vitest";

import {
  initializeMetrics,
  shutdownMetrics,
} from "@/lib/observability/metrics";
import { startRuntimeMetricsSampler } from "@/lib/observability/metrics/runtime-sampler";

afterEach(async () => {
  await shutdownMetrics();
});

it("samples pool and process state and stops its resources", async () => {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
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
      deploymentId: "test-deployment",
      instanceId: "web-1",
      role: "web",
      sessionId: "session-1",
      stableId: "test-deployment/web/web-1",
    },
    readerFactory: () => new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 60_000,
      exportTimeoutMillis: 10_000,
    }),
    serviceVersion: "test",
  });
  let monitorEnabled = false;
  let samples = 0;
  let scheduledSample: (() => void) | undefined;
  let scheduleCancelled = false;
  const sampler = startRuntimeMetricsSampler({
    eventLoopDelayMonitor: {
      disable() {
        monitorEnabled = false;
      },
      enable() {
        monitorEnabled = true;
      },
      mean: 2_000_000,
      percentile: () => 5_000_000,
      reset: () => undefined,
    },
    intervalMs: 1_000,
    pool: {
      idleCount: 3,
      totalCount: 5,
      waitingCount: 1,
    },
    processReader: {
      cpuUsage() {
        samples += 1;
        return { system: 1_000_000 * samples, user: 2_000_000 * samples };
      },
      memoryUsage: () => ({
        arrayBuffers: 10,
        external: 20,
        heapTotal: 200,
        heapUsed: 100,
        rss: 300,
      }),
      uptime: () => 42,
    },
    scheduler: {
      schedule(callback) {
        scheduledSample = callback;
        return {
          cancel() {
            scheduleCancelled = true;
          },
        };
      },
    },
  });

  expect(monitorEnabled).toBe(true);
  await runtime.forceFlush();
  const exported = exporter.getMetrics().at(-1);
  const metrics = exported?.scopeMetrics.flatMap((scope) => scope.metrics) ?? [];
  expect(metrics.map((metric) => metric.descriptor.name)).toEqual(
    expect.arrayContaining([
      "anonresume.db.client.connections",
      "anonresume.process.cpu.time",
      "anonresume.process.event_loop.delay",
      "anonresume.process.memory.usage",
      "anonresume.process.uptime",
    ]),
  );
  const connections = metrics.find(
    (metric) => metric.descriptor.name === "anonresume.db.client.connections",
  );
  expect(connections?.dataPoints).toEqual(expect.arrayContaining([
    expect.objectContaining({ attributes: { state: "active" }, value: 2 }),
    expect.objectContaining({ attributes: { state: "idle" }, value: 3 }),
    expect.objectContaining({ attributes: { state: "waiting" }, value: 1 }),
  ]));

  sampler.stop();
  expect(monitorEnabled).toBe(false);
  expect(scheduleCancelled).toBe(true);
  scheduledSample?.();
  expect(samples).toBe(1);
});
