import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";
import { startAccountMaintenanceLoop } from "@/lib/auth/account/maintenance-runtime";
import { startAccountMergeRuntime } from "@/lib/auth/account/merge/runtime";
import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { getRuntimeConfigManager } from "@/lib/config/runtime";
import { logNextRequestError } from "@/lib/observability/http/framework-error";
import {
  getLogger,
  initializeLogging,
  serializeSafeError,
  writeLocalSensitiveEvent,
} from "@/lib/observability/logging";
import {
  startServiceMetrics,
  type ServiceMetricsLifecycle,
} from "@/lib/observability/metrics";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";
import { startWebRestartRuntime } from "@/lib/runtime/restart/process-runtime";
import { startServiceTracing, type ServiceTracingLifecycle } from "@/lib/observability/tracing/runtime";
import { stopDiagnosticStore } from "@/lib/observability/diagnostics/store/runtime";

const identity = resolveRuntimeIdentity("web");
initializeLogging({ identity, role: "web" });
const runtimeLog = getLogger("anonresume.runtime");
runtimeLog.info("process_started", { outcome: "success" });
let metricsLifecycle: ServiceMetricsLifecycle | undefined;
let tracingLifecycle: ServiceTracingLifecycle | undefined;
const stopMetrics = () => {
  void stopDiagnosticStore();
  void metricsLifecycle?.stop();
  void tracingLifecycle?.stop();
};

try {
  readBootstrapConfig();

  const setup = await initializePendingInstanceSetup({ identity });

  if (setup.generated) {
    writeLocalSensitiveEvent({
      action: "instance_setup_code_generated",
      message:
        `[AnonResume][INSTANCE SETUP CODE - KEEP SECRET] ${setup.rawCode} (expires ${setup.expiresAt.toISOString()})`,
    });
  }

  const runtimeManager = getRuntimeConfigManager("web");
  await runtimeManager.start();
  const snapshot = await runtimeManager.snapshot();
  tracingLifecycle = await startServiceTracing({ identity, values: snapshot.values });
  metricsLifecycle = await startServiceMetrics({
    configurationHealth: snapshot.health,
    identity,
    values: snapshot.values,
  });
  process.once("SIGINT", stopMetrics);
  process.once("SIGTERM", stopMetrics);

  startAccountMaintenanceLoop();
  startAccountMergeRuntime();
  await startWebRestartRuntime({
    beforeSignal: async () => { await Promise.all([metricsLifecycle?.stop(), tracingLifecycle?.stop(), stopDiagnosticStore()]); },
    identity,
    runtimeManager,
  });
} catch (error) {
  process.off("SIGINT", stopMetrics);
  process.off("SIGTERM", stopMetrics);
  await metricsLifecycle?.stop();
  await tracingLifecycle?.stop();
  runtimeLog.error("process_startup_failed", {
    error: serializeSafeError(error),
    outcome: "failure",
  });
  throw error;
}

export { logNextRequestError };
