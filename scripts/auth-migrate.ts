import { getMigrations } from "better-auth/db/migration";

import {
  getLogger,
  initializeLogging,
  serializeSafeError,
} from "@/lib/observability/logging";

initializeLogging({ role: "migrate" });
const configurationLog = getLogger("anonresume.configuration");
const { getDatabasePool } = await import("@/lib/runtime/database");
const { auth } = await import("./auth-migration-config");

try {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  configurationLog.info("auth_migration_completed", { outcome: "success" });
} catch (error) {
  configurationLog.error("auth_migration_failed", {
    error: serializeSafeError(error),
    outcome: "failure",
  });
  throw error;
} finally {
  await getDatabasePool().end();
}
