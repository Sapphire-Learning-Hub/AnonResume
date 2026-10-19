import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AlwaysOffSampler,
  BatchSpanProcessor,
  NodeTracerProvider,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-node";
import { parseTracingConfiguration } from "@/lib/config/observability";
import type { ManagedConfig } from "@/lib/config/registry";
import {
  getLogger,
  readLoggingConfiguration,
  serializeSafeError,
} from "@/lib/observability/logging";
import type { RuntimeIdentity } from "@/lib/runtime/instance-identity";
import { resolveReleaseMetadata } from "@/lib/runtime/release-metadata";
import { SafeTraceExporter } from "./exporter";
import { applicationBuildId } from "@/lib/config/build-metadata";

export interface ServiceTracingLifecycle {
  stop(): Promise<void>;
}
let active: ServiceTracingLifecycle | undefined;

export async function startServiceTracing(options: {
  values: ManagedConfig;
  identity: RuntimeIdentity;
}): Promise<ServiceTracingLifecycle> {
  if (active) return active;
  const logger = getLogger("anonresume.tracing");
  try {
    const configuration = parseTracingConfiguration(options.values);
    const release = resolveReleaseMetadata();
    const provider = new NodeTracerProvider({
      sampler: configuration.enabled
        ? new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(configuration.sampleRate),
          })
        : new AlwaysOffSampler(),
      resource: resourceFromAttributes({
        "service.name": `anonresume-${options.identity.role}`,
        "service.instance.id": options.identity.instanceId,
        "service.deployment.id": options.identity.deploymentId,
        "service.namespace": "anonresume",
        "service.version": release.tag,
        "service.build.id":
          applicationBuildId === "development"
            ? (release.commit ?? "unknown")
            : applicationBuildId,
        "deployment.environment.name": readLoggingConfiguration().environment,
      }),
      spanLimits: {
        attributeCountLimit: 32,
        attributeValueLengthLimit: 512,
        eventCountLimit: 16,
        linkCountLimit: 4,
      },
      spanProcessors: configuration.enabled
        ? [
            new BatchSpanProcessor(
              new SafeTraceExporter(
                new OTLPTraceExporter({
                  url: configuration.endpoint,
                  headers: { ...configuration.headers },
                  timeoutMillis: configuration.exportTimeoutMs,
                }),
              ),
              {
                maxQueueSize: 2048,
                maxExportBatchSize: 256,
                scheduledDelayMillis: 5000,
                exportTimeoutMillis: configuration.exportTimeoutMs,
              },
            ),
          ]
        : [],
    });
    // No automatic propagation: public headers and provider requests are untrusted.
    provider.register({ propagator: null });
    let stopped = false;
    active = {
      async stop() {
        if (stopped) return;
        stopped = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            provider.shutdown(),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 5000);
              timer.unref();
            }),
          ]);
        } catch (error) {
          logger.warn("tracing_shutdown_failed", {
            error: serializeSafeError(error),
            outcome: "failure",
          });
        } finally {
          if (timer) clearTimeout(timer);
        }
      },
    };
    return active;
  } catch (error) {
    logger.error("tracing_initialization_failed", {
      error: serializeSafeError(error),
      outcome: "failure",
    });
    return { stop: async () => undefined };
  }
}
