import {
  getLogger,
  initializeLogging,
  serializeSafeError,
} from "@/lib/observability/logging";

initializeLogging({ role: "migrate" });
const configurationLog = getLogger("anonresume.configuration");
const { migrateDatabase } = await import("@/db/migrate");
const { getDatabasePool } = await import("@/lib/runtime/database");

try {
  await migrateDatabase();
  configurationLog.info("database_migration_completed", { outcome: "success" });
} catch (error) {
  configurationLog.error("database_migration_failed", {
    error: serializeSafeError(error),
    outcome: "failure",
  });
  throw error;
} finally {
  await getDatabasePool().end();
}
