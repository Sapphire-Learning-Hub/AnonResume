import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";
import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";

readBootstrapConfig();

const identity = resolveRuntimeIdentity("web");
const setup = await initializePendingInstanceSetup({ identity });

if (setup.generated) {
  console.info(
    `[AnonResume][INSTANCE SETUP CODE - KEEP SECRET] ${setup.rawCode} (expires ${setup.expiresAt.toISOString()})`,
  );
}
