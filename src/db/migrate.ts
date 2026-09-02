import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { getDatabasePool } from "@/lib/database";

import { getDatabaseSchemaName } from "./schema";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function migrateDatabase() {
  const schemaName = getDatabaseSchemaName();
  const client = await getDatabasePool().connect();
  const migrationLockName = `anonresume:migrate:${schemaName}`;

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      migrationLockName,
    ]);
    await client.query(
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`,
    );
    await client.query(
      `SET search_path TO ${quoteIdentifier(schemaName)}, public`,
    );

    await migrate(drizzle(client), {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
      migrationsSchema: schemaName,
    });
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
      migrationLockName,
    ]);
    client.release();
  }
}
