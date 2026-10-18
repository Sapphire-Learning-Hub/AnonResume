import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";
import { startAccountMaintenanceLoop } from "@/lib/auth/account/maintenance-runtime";
import { startAccountMergeRuntime } from "@/lib/auth/account/merge/runtime";
import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { logNextRequestError } from "@/lib/observability/http/framework-error";
import { initializeLogging } from "@/lib/observability/logging";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";
import { startWebRestartRuntime } from "@/lib/runtime/restart/process-runtime";

const identity = resolveRuntimeIdentity("web");
initializeLogging({ identity, role: "web" });
readBootstrapConfig();

const setup = await initializePendingInstanceSetup({ identity });

if (setup.generated) {
  console.info(
    `[AnonResume][INSTANCE SETUP CODE - KEEP SECRET] ${setup.rawCode} (expires ${setup.expiresAt.toISOString()})`,
  );
}

startAccountMaintenanceLoop();
startAccountMergeRuntime();
await startWebRestartRuntime({ identity });

export { logNextRequestError };
