import { getMigrations } from "better-auth/db/migration";

import { getDatabasePool } from "@/lib/runtime/database";

import { auth } from "./auth-migration-config";

try {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  console.info("Better Auth migrations applied.");
} finally {
  await getDatabasePool().end();
}
