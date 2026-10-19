import {
  getLogger,
  initializeLogging,
  serializeSafeError,
} from "@/lib/observability/logging";
import type { ServiceMetricsLifecycle } from "@/lib/observability/metrics";
import { startServiceTracing, type ServiceTracingLifecycle } from "@/lib/observability/tracing/runtime";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";
import { stopDiagnosticStore } from "@/lib/observability/diagnostics/store/runtime";

const processIdentity = resolveRuntimeIdentity("pdf-worker");
initializeLogging({ identity: processIdentity, role: "pdf-worker" });
const runtimeLog = getLogger("anonresume.runtime");
const controller = new AbortController();
const stop = () => controller.abort();

process.once("SIGINT", stop);
process.once("SIGTERM", stop);
runtimeLog.info("process_started", { outcome: "success" });

const { getDatabasePool } = await import("@/lib/runtime/database");
const { startServiceMetrics } = await import("@/lib/observability/metrics");
const { runPdfExportWorker } = await import("@/lib/pdf/export-worker");
const { getRuntimeConfigManager } = await import("@/lib/config/runtime");
const { withWorkerInstanceLock } = await import("@/lib/runtime/worker-instance-lock");
const { startWorkerRestartRuntime } = await import("@/lib/runtime/restart/process-runtime");
const runtimeManager = getRuntimeConfigManager("pdf-worker");
let metricsLifecycle: ServiceMetricsLifecycle | undefined;
let tracingLifecycle: ServiceTracingLifecycle | undefined;

try {
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
    consumer: "pdf-worker",
    runtimeManager,
    work: () => withWorkerInstanceLock(identity.instanceId, () =>
      runPdfExportWorker({ signal: controller.signal, runtimeManager })),
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
