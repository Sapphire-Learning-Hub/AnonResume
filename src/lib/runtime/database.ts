import { Pool } from "pg";

declare global {
  var __anonResumeDatabasePool: Pool | undefined;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

export function getDatabasePool() {
  globalThis.__anonResumeDatabasePool ??= new Pool({
    connectionString: getDatabaseUrl(),
  });

  return globalThis.__anonResumeDatabasePool;
}
