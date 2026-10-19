import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  type IMetricReader,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

import type { MetricsConfiguration } from "@/lib/config/observability";
import { getLogger, serializeSafeError } from "@/lib/observability/logging";
import type { RuntimeIdentity } from "@/lib/runtime/instance-identity";

import { applicationMetrics } from "./instruments";

const metricsLog = getLogger("anonresume.metrics");
const METER_NAME = "io.github.sapphire-learning-hub.anonresume";
const SHUTDOWN_TIMEOUT_MS = 5_000;

export interface MetricsRuntime {
  readonly enabled: boolean;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

interface MetricsRuntimeOptions {
  configuration: MetricsConfiguration;
  environment: string;
  identity: RuntimeIdentity;
  readerFactory?: () => IMetricReader;
  serviceVersion: string;
}

let activeRuntime: MetricsRuntime | undefined;

export function buildMetricsResourceAttributes(input: {
  environment: string;
  identity: RuntimeIdentity;
  serviceVersion: string;
}) {
  return {
    "deployment.environment.name": input.environment,
    "service.deployment.id": input.identity.deploymentId,
    "service.instance.id": input.identity.instanceId,
    "service.name": `anonresume-${input.identity.role}`,
    "service.namespace": "anonresume",
    "service.version": input.serviceVersion,
  };
}

function disabledRuntime(): MetricsRuntime {
  return {
    enabled: false,
    forceFlush: async () => undefined,
    shutdown: async () => undefined,
  };
}

export async function initializeMetrics(
  options: MetricsRuntimeOptions,
): Promise<MetricsRuntime> {
  if (activeRuntime) return activeRuntime;
  if (!options.configuration.enabled) return disabledRuntime();

  try {
    const reader = options.readerFactory?.() ??
      new PeriodicExportingMetricReader({
        cardinalityLimits: { default: 128 },
        exporter: new OTLPMetricExporter({
          headers: { ...options.configuration.headers },
          url: options.configuration.endpoint,
        }),
        exportIntervalMillis: options.configuration.exportIntervalMs,
        exportTimeoutMillis: options.configuration.exportTimeoutMs,
      });
    const provider = new MeterProvider({
      readers: [reader],
      resource: resourceFromAttributes(
        buildMetricsResourceAttributes(options),
      ),
    });
    const unbind = applicationMetrics.bind(
      provider.getMeter(METER_NAME, options.serviceVersion),
    );
    let stopped = false;
    const runtime: MetricsRuntime = {
      enabled: true,
      forceFlush: () => provider.forceFlush({
        timeoutMillis: SHUTDOWN_TIMEOUT_MS,
      }),
      async shutdown() {
        if (stopped) return;
        stopped = true;
        unbind();
        await provider.shutdown({ timeoutMillis: SHUTDOWN_TIMEOUT_MS });
        if (activeRuntime === runtime) activeRuntime = undefined;
      },
    };
    activeRuntime = runtime;
    metricsLog.info("metrics_runtime_started", { outcome: "success" });
    return runtime;
  } catch (error) {
    metricsLog.error("metrics_runtime_start_failed", {
      error: serializeSafeError(error),
      outcome: "failure",
    });
    return disabledRuntime();
  }
}

export async function shutdownMetrics() {
  const runtime = activeRuntime;
  activeRuntime = undefined;
  if (!runtime) return;
  try {
    await runtime.shutdown();
  } catch (error) {
    metricsLog.warn("metrics_runtime_shutdown_failed", {
      error: serializeSafeError(error),
      outcome: "failure",
    });
  }
}
