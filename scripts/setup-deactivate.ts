import {
  deactivateInstanceSetup,
  parseSetupDeactivateArguments,
  SetupRecoveryError,
} from "@/lib/admin/setup/recovery";
import { validateBootstrapConfiguration } from "@/lib/runtime/configuration";
import { getDatabasePool } from "@/lib/runtime/database";

const usage =
  "Usage: anonresume setup-deactivate --reason <text> --confirm <deployment-id>";
let databaseOpened = false;

try {
  const configuration = validateBootstrapConfiguration();
  if (!configuration.valid) {
    throw new SetupRecoveryError("setup_recovery_configuration_invalid");
  }
  const input = parseSetupDeactivateArguments(process.argv.slice(2));
  databaseOpened = true;
  const result = await deactivateInstanceSetup(input);
  console.info(
    `Management recovery is pending${result.targetUserId ? " for the existing super administrator" : ""}. Restart the Web service to issue a recovery setup code.`,
  );
} catch (error) {
  if (error instanceof SetupRecoveryError) {
    console.error(error.code === "setup_recovery_usage" ? usage : error.code);
    process.exitCode = 2;
  } else {
    console.error("setup_recovery_failed");
    process.exitCode = 1;
  }
} finally {
  if (databaseOpened) {
    await getDatabasePool().end().catch(() => undefined);
  }
}
