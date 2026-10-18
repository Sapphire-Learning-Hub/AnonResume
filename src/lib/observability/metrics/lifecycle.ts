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

import { startQueueMetricsSampler } from "./queue-sampler";
import { initializeMetrics } from "./runtime";
import { startRuntimeMetricsSampler } from "./runtime-sampler";

const metricsLog = getLogger("anonresume.metrics");

export interface ServiceMetricsLifecycle {
  readonly enabled: boolean;
  stop(): Promise<void>;
}

interface ServiceMetricsOptions {
  identity: RuntimeIdentity;
  values: ManagedConfig;
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
      await queueSampler.stop();
      runtimeSampler.stop();
      await runtime.shutdown();
    },
  };
}
