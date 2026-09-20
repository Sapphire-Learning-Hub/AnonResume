import type { PoolClient } from "pg";
import type { TestProject } from "vitest/node";

import { loadTestEnvironmentFile } from "./environment";

const TEST_SCHEMA_PREFIX = "anonresume_test";
const TEST_SUITE_LOCK = "anonresume:test-suite";

declare module "vitest" {
  export interface ProvidedContext {
    databaseSchemaPrefix: string;
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function testSchemaNames(workerCount: number) {
  return Array.from(
    { length: workerCount },
    (_, index) => `${TEST_SCHEMA_PREFIX}_${index + 1}`,
  );
}

async function releaseSuiteLock(client: PoolClient) {
  await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
    TEST_SUITE_LOCK,
  ]);
  client.release();
}

export default async function setup(project: TestProject) {
  loadTestEnvironmentFile();

  const originalSchema = process.env.ANONRESUME_DB_SCHEMA;
  const { getDatabasePool } = await import("@/lib/runtime/database");
  const { migrateDatabase } = await import("@/db/migrate");
  const pool = getDatabasePool();
  const lockClient = await pool.connect();
  const workerCount = project.config.maxWorkers ??
    project.globalConfig.maxWorkers;

  if (!workerCount) {
    lockClient.release();
    await pool.end();
    throw new Error("test_worker_count_unavailable");
  }

  const schemaNames = testSchemaNames(workerCount);
  let lockAcquired = false;

  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [
      TEST_SUITE_LOCK,
    ]);
    lockAcquired = true;

    for (const schemaName of schemaNames) {
      await pool.query(
        `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`,
      );
      process.env.ANONRESUME_DB_SCHEMA = schemaName;
      await migrateDatabase();
    }
  } catch (error) {
    if (lockAcquired) {
      await releaseSuiteLock(lockClient);
    } else {
      lockClient.release();
    }
    await pool.end();
    restoreSchema(originalSchema);
    throw error;
  }

  project.provide("databaseSchemaPrefix", TEST_SCHEMA_PREFIX);
  restoreSchema(originalSchema);

  return async () => {
    try {
      for (const schemaName of schemaNames) {
        await pool.query(
          `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`,
        );
      }
    } finally {
      await releaseSuiteLock(lockClient);
      await pool.end();
    }
  };
}

function restoreSchema(value: string | undefined) {
  if (value === undefined) {
    delete process.env.ANONRESUME_DB_SCHEMA;
  } else {
    process.env.ANONRESUME_DB_SCHEMA = value;
  }
}
