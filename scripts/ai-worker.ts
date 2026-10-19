import {
  getLogger,
  initializeLogging,
  serializeSafeError,
} from "@/lib/observability/logging";
import type { ServiceMetricsLifecycle } from "@/lib/observability/metrics";
import { startServiceTracing, type ServiceTracingLifecycle } from "@/lib/observability/tracing/runtime";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";
import { stopDiagnosticStore } from "@/lib/observability/diagnostics/store/runtime";

const processIdentity = resolveRuntimeIdentity("ai-worker");
initializeLogging({ identity: processIdentity, role: "ai-worker" });
const runtimeLog = getLogger("anonresume.runtime");
const controller = new AbortController();
const stop = () => controller.abort();

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
runtimeLog.info("process_started", { outcome: "success" });

const { getAiCredentialsEncryptionKey } = await import("@/lib/ai/config/configuration");
const { runAiWorker } = await import("@/lib/ai/worker");
const { getRuntimeConfigManager } = await import("@/lib/config/runtime");
const { getDatabasePool } = await import("@/lib/runtime/database");
const { startServiceMetrics } = await import("@/lib/observability/metrics");
const { validateBootstrapConfiguration } = await import("@/lib/runtime/configuration");
const { startWorkerRestartRuntime } = await import("@/lib/runtime/restart/process-runtime");
const { withWorkerInstanceLock } = await import("@/lib/runtime/worker-instance-lock");
const runtimeManager = getRuntimeConfigManager("ai-worker");
let metricsLifecycle: ServiceMetricsLifecycle | undefined;
let tracingLifecycle: ServiceTracingLifecycle | undefined;

try {
  const configuration = validateBootstrapConfiguration();
  if (!configuration.valid) throw new Error("invalid_production_configuration");
  await runtimeManager.start();
  const identity = await runtimeManager.snapshot();
  tracingLifecycle = await startServiceTracing({ identity: processIdentity, values: identity.values });
  metricsLifecycle = await startServiceMetrics({
    configurationHealth: identity.health,
    identity: processIdentity,
    values: identity.values,
  });
  await startWorkerRestartRuntime({
    abort: stop,
    consumer: "ai-worker",
    runtimeManager,
    work: () => withWorkerInstanceLock(identity.instanceId, () =>
      runAiWorker({
        signal: controller.signal,
        encryptionKey: getAiCredentialsEncryptionKey(),
        runtimeManager,
      })),
  });
} catch (error) {
  runtimeLog.error("process_failed", {
    error: serializeSafeError(error),
    outcome: "failure",
  });
  throw error;
} finally {
  await stopDiagnosticStore();
  await metricsLifecycle?.stop();
  await tracingLifecycle?.stop();
  await runtimeManager.stop();
  await getDatabasePool().end();
  runtimeLog.info("process_stopped", { outcome: "success" });
}
