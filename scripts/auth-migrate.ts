import { getMigrations } from "better-auth/db/migration";
import { readFile } from "node:fs/promises";

import {
  getLogger,
  initializeLogging,
  serializeSafeError,
} from "@/lib/observability/logging";

initializeLogging({ role: "migrate" });
const configurationLog = getLogger("anonresume.configuration");
const { getDatabasePool } = await import("@/lib/runtime/database");

try {
  // Apply the reviewed compatibility migration before initializing Better Auth:
  // its schema guard rejects the required issuer column left by 1.7.0–1.7.2.
  await getDatabasePool().query(
    await readFile(
      new URL(
        "../drizzle/0048_better_auth_provider_identity.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const { auth } = await import("./auth-migration-config");
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
