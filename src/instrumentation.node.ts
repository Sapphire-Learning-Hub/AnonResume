import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";
import { startAccountMaintenanceLoop } from "@/lib/auth/account/maintenance-runtime";
import { startAccountMergeRuntime } from "@/lib/auth/account/merge/runtime";
import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { logNextRequestError } from "@/lib/observability/http/framework-error";
import {
  getLogger,
  initializeLogging,
  serializeSafeError,
  writeLocalSensitiveEvent,
} from "@/lib/observability/logging";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";
import { startWebRestartRuntime } from "@/lib/runtime/restart/process-runtime";

const identity = resolveRuntimeIdentity("web");
initializeLogging({ identity, role: "web" });
const runtimeLog = getLogger("anonresume.runtime");
runtimeLog.info("process_started", { outcome: "success" });

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

  startAccountMaintenanceLoop();
  startAccountMergeRuntime();
  await startWebRestartRuntime({ identity });
} catch (error) {
  runtimeLog.error("process_startup_failed", {
    error: serializeSafeError(error),
    outcome: "failure",
  });
  throw error;
}

export { logNextRequestError };
