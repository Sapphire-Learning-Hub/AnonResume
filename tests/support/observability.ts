import { initializeLogging } from "@/lib/observability/logging";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

import {
  initializeMetrics,
  shutdownMetrics,
} from "@/lib/observability/metrics";

export function initializeLogCapture(
  role: "web" | "ai-worker" | "pdf-worker" = "web",
) {
  const lines: string[] = [];
  initializeLogging({
    destination: {
      write(line: string) {
        lines.push(line);
      },
    },
    identity: {
      deploymentId: "test-deployment",
      instanceId: `${role}-1`,
      role,
      sessionId: "session-1",
      stableId: `test-deployment/${role}/${role}-1`,
    },
    role,
  });

  return {
    events: () =>
      lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    lines,
  };
}

export const initializeHttpLogCapture = initializeLogCapture;

export async function initializeMetricCapture(
  role: "web" | "ai-worker" | "pdf-worker" = "web",
) {
  await shutdownMetrics();
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
      instanceId: `${role}-1`,
      role,
      sessionId: "session-1",
      stableId: `test-deployment/${role}/${role}-1`,
    },
    readerFactory: () => new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 60_000,
      exportTimeoutMillis: 10_000,
    }),
    serviceVersion: "test",
  });

  return {
    async metrics() {
      await runtime.forceFlush();
      return exporter.getMetrics().at(-1)?.scopeMetrics.flatMap(
        (scope) => scope.metrics,
      ) ?? [];
    },
    shutdown: shutdownMetrics,
  };
}
