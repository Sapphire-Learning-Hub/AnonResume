import {
  getLogger,
  initializeLogging,
  serializeSafeError,
} from "@/lib/observability/logging";
import type { ServiceMetricsLifecycle } from "@/lib/observability/metrics";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";

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

try {
  await runtimeManager.start();
  const identity = await runtimeManager.snapshot();
  metricsLifecycle = await startServiceMetrics({
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
  await metricsLifecycle?.stop();
  await runtimeManager.stop();
  await getDatabasePool().end();
  runtimeLog.info("process_stopped", { outcome: "success" });
}
