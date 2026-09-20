import { Pool } from "pg";

import {
  readBootstrapDatabaseUrl,
  type BootstrapConfigInput,
} from "@/lib/config/bootstrap";

declare global {
  var __anonResumeDatabasePool: Pool | undefined;
}

export function createDatabasePoolOptions(input: BootstrapConfigInput = {}) {
  return {
    connectionString: readBootstrapDatabaseUrl(input),
  };
}

export function getDatabasePool() {
  globalThis.__anonResumeDatabasePool ??= new Pool(createDatabasePoolOptions());

  return globalThis.__anonResumeDatabasePool;
}
