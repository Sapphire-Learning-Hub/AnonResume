import { beforeEach, expect, it, vi } from "vitest";

import type { ManagedConfig } from "@/lib/config/registry";
import { startServiceMetrics } from "@/lib/observability/metrics/lifecycle";

const {
  calls,
  initializeMetrics,
  startQueueMetricsSampler,
  startRuntimeMetricsSampler,
} = vi.hoisted(() => {
  const lifecycleCalls: string[] = [];
  return {
    calls: lifecycleCalls,
    initializeMetrics: vi.fn(async () => ({
      enabled: true,
      forceFlush: async () => undefined,
      shutdown: async () => {
        lifecycleCalls.push("runtime-shutdown");
      },
    })),
    startQueueMetricsSampler: vi.fn(() => ({
      refresh: async () => undefined,
      async stop() {
        lifecycleCalls.push("queue-stop");
      },
    })),
    startRuntimeMetricsSampler: vi.fn(() => ({
      stop() {
        lifecycleCalls.push("process-stop");
      },
    })),
  };
});

vi.mock("@/lib/observability/metrics/runtime", () => ({ initializeMetrics }));
vi.mock("@/lib/observability/metrics/queue-sampler", () => ({
  startQueueMetricsSampler,
}));
vi.mock("@/lib/observability/metrics/runtime-sampler", () => ({
  startRuntimeMetricsSampler,
}));

function values(overrides: Partial<ManagedConfig> = {}): ManagedConfig {
  return {
    metricsEnabled: true,
    metricsExportIntervalMs: 60_000,
    metricsExportTimeoutMs: 10_000,
    metricsOtlpEndpoint: "http://otel-collector:4318/v1/metrics",
    metricsOtlpHeaders: "",
    ...overrides,
  } as ManagedConfig;
}

const identity = {
  deploymentId: "test-deployment",
  instanceId: "web-1",
  role: "web" as const,
  sessionId: "session-1",
  stableId: "test-deployment/web/web-1",
};

beforeEach(() => {
  calls.length = 0;
  initializeMetrics.mockClear();
  startQueueMetricsSampler.mockClear();
  startRuntimeMetricsSampler.mockClear();
});

it("keeps every sampler disabled when managed metrics are disabled", async () => {
  const lifecycle = await startServiceMetrics({
    identity,
    values: values({ metricsEnabled: false }),
  });

  expect(lifecycle.enabled).toBe(false);
  expect(initializeMetrics).not.toHaveBeenCalled();
  expect(startQueueMetricsSampler).not.toHaveBeenCalled();
  expect(startRuntimeMetricsSampler).not.toHaveBeenCalled();
  await lifecycle.stop();
});

it("fails closed when an enabled configuration is incomplete", async () => {
  const lifecycle = await startServiceMetrics({
    identity,
    values: values({ metricsOtlpEndpoint: "" }),
  });

  expect(lifecycle.enabled).toBe(false);
  expect(initializeMetrics).not.toHaveBeenCalled();
  expect(startQueueMetricsSampler).not.toHaveBeenCalled();
});

it("starts process and queue samplers and shuts them down before the runtime", async () => {
  const lifecycle = await startServiceMetrics({ identity, values: values() });

  expect(lifecycle.enabled).toBe(true);
  expect(initializeMetrics).toHaveBeenCalledOnce();
  expect(startRuntimeMetricsSampler).toHaveBeenCalledOnce();
  expect(startQueueMetricsSampler).toHaveBeenCalledOnce();

  await lifecycle.stop();
  await lifecycle.stop();

  expect(calls).toEqual([
    "process-stop",
    "queue-stop",
    "runtime-shutdown",
  ]);
});

it("does not let a stalled queue sample block service shutdown", async () => {
  startQueueMetricsSampler.mockImplementationOnce(() => ({
    refresh: async () => undefined,
    stop: () => new Promise<void>(() => undefined),
  }));
  const lifecycle = await startServiceMetrics({
    identity,
    shutdownTimeoutMs: 10,
    values: values(),
  });

  await expect(lifecycle.stop()).resolves.toBeUndefined();
  expect(calls).toEqual(["process-stop", "runtime-shutdown"]);
});
