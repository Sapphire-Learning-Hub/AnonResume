import {
  parseMetricsConfiguration,
  type MetricsConfiguration,
} from "@/lib/config/observability";
import type { ManagedConfig } from "@/lib/config/registry";
import { readAiQueueMetricsSnapshot } from "@/lib/ai/runs/queue";
import { readPdfQueueMetricsSnapshot } from "@/lib/pdf/export-queue";
import {
  getLogger,
  readLoggingConfiguration,
  serializeSafeError,
} from "@/lib/observability/logging";
import { getDatabasePool } from "@/lib/runtime/database";
import type { RuntimeIdentity } from "@/lib/runtime/instance-identity";
import { resolveReleaseMetadata } from "@/lib/runtime/release-metadata";

import { applicationMetrics } from "./instruments";
import { startQueueMetricsSampler } from "./queue-sampler";
import { initializeMetrics } from "./runtime";
import { startRuntimeMetricsSampler } from "./runtime-sampler";
import type { RuntimeConfigurationHealth } from "./types";

const metricsLog = getLogger("anonresume.metrics");
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

export interface ServiceMetricsLifecycle {
  readonly enabled: boolean;
  stop(): Promise<void>;
}

interface ServiceMetricsOptions {
  configurationHealth?: RuntimeConfigurationHealth;
  identity: RuntimeIdentity;
  shutdownTimeoutMs?: number;
  values: ManagedConfig;
}

async function settlesWithin(
  cleanup: Promise<unknown>,
  timeoutMs: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const completed = await Promise.race([
    cleanup.then(() => true),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      timer.unref();
    }),
  ]);
  if (timer) clearTimeout(timer);
  return completed;
}

function disabledLifecycle(): ServiceMetricsLifecycle {
  return {
    enabled: false,
    stop: async () => undefined,
  };
}

function readConfiguration(values: ManagedConfig): MetricsConfiguration | null {
  try {
    return parseMetricsConfiguration(values);
  } catch (error) {
    metricsLog.error("metrics_configuration_invalid", {
      error: serializeSafeError(error),
      outcome: "failure",
    });
    return null;
  }
}

export async function startServiceMetrics(
  options: ServiceMetricsOptions,
): Promise<ServiceMetricsLifecycle> {
  if (!options.values.metricsEnabled) return disabledLifecycle();

  const configuration = readConfiguration(options.values);
  if (!configuration?.enabled) return disabledLifecycle();

  const runtime = await initializeMetrics({
    configuration,
    environment: readLoggingConfiguration().environment,
    identity: options.identity,
    serviceVersion: resolveReleaseMetadata().tag,
  });
  if (!runtime.enabled) return disabledLifecycle();

  applicationMetrics.recordRuntimeConfigurationHealth(
    options.configurationHealth ?? "healthy",
  );

  const runtimeSampler = startRuntimeMetricsSampler({
    pool: getDatabasePool(),
  });
  const queueSampler = startQueueMetricsSampler({
    sources: [
      { jobType: "ai", readSnapshot: readAiQueueMetricsSnapshot },
      { jobType: "pdf", readSnapshot: readPdfQueueMetricsSnapshot },
    ],
  });
  let stopped = false;

  return {
    enabled: true,
    async stop() {
      if (stopped) return;
      stopped = true;
      runtimeSampler.stop();
      const completed = await settlesWithin(
        Promise.allSettled([
          queueSampler.stop(),
          runtime.shutdown(),
        ]),
        options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
      );
      if (!completed) {
        metricsLog.warn("metrics_runtime_shutdown_timed_out", {
          outcome: "failure",
        });
      }
    },
  };
}
