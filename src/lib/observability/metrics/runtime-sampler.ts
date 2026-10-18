import { monitorEventLoopDelay } from "node:perf_hooks";

import type { Pool } from "pg";

import { applicationMetrics } from "./instruments";

interface EventLoopDelayMonitor {
  disable(): void;
  enable(): void;
  readonly mean: number;
  percentile(value: number): number;
  reset(): void;
}

interface ProcessReader {
  cpuUsage(): NodeJS.CpuUsage;
  memoryUsage(): NodeJS.MemoryUsage;
  uptime(): number;
}

interface RuntimeMetricsSamplerOptions {
  eventLoopDelayMonitor?: EventLoopDelayMonitor;
  intervalMs?: number;
  pool: Pick<Pool, "idleCount" | "totalCount" | "waitingCount">;
  processReader?: ProcessReader;
  scheduler?: RuntimeMetricsScheduler;
}

interface RuntimeMetricsScheduler {
  schedule(callback: () => void, intervalMs: number): { cancel(): void };
}

const DEFAULT_INTERVAL_MS = 10_000;
const defaultScheduler: RuntimeMetricsScheduler = {
  schedule(callback, intervalMs) {
    const timer = setInterval(callback, intervalMs);
    timer.unref();
    return { cancel: () => clearInterval(timer) };
  },
};

function secondsFromNanoseconds(value: number) {
  return Number.isFinite(value) ? Math.max(0, value / 1_000_000_000) : 0;
}

export function startRuntimeMetricsSampler(
  options: RuntimeMetricsSamplerOptions,
) {
  const eventLoopDelay = options.eventLoopDelayMonitor ??
    monitorEventLoopDelay({ resolution: 20 });
  const processReader = options.processReader ?? {
    cpuUsage: () => process.cpuUsage(),
    memoryUsage: () => process.memoryUsage(),
    uptime: () => process.uptime(),
  };
  let previousCpu = { system: 0, user: 0 };
  let stopped = false;

  const sample = () => {
    if (stopped) return;
    const cpu = processReader.cpuUsage();
    const memory = processReader.memoryUsage();
    applicationMetrics.recordRuntimeSnapshot({
      cpuSystemSeconds: Math.max(0, cpu.system - previousCpu.system) / 1_000_000,
      cpuUserSeconds: Math.max(0, cpu.user - previousCpu.user) / 1_000_000,
      database: {
        active: Math.max(0, options.pool.totalCount - options.pool.idleCount),
        idle: options.pool.idleCount,
        total: options.pool.totalCount,
        waiting: options.pool.waitingCount,
      },
      eventLoopDelayMeanSeconds: secondsFromNanoseconds(eventLoopDelay.mean),
      eventLoopDelayP99Seconds: secondsFromNanoseconds(
        eventLoopDelay.percentile(99),
      ),
      memory,
      uptimeSeconds: Math.max(0, processReader.uptime()),
    });
    previousCpu = cpu;
    eventLoopDelay.reset();
  };

  eventLoopDelay.enable();
  sample();
  const scheduled = (options.scheduler ?? defaultScheduler).schedule(
    sample,
    options.intervalMs ?? DEFAULT_INTERVAL_MS,
  );

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      scheduled.cancel();
      eventLoopDelay.disable();
    },
  };
}
