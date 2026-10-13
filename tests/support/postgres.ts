import type { PoolClient } from "pg";
import { vi } from "vitest";

import { getDatabasePool } from "@/lib/runtime/database";

export async function getDatabaseBackendPid(client: PoolClient) {
  const result = await client.query<{ pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  );
  const pid = result.rows[0]?.pid;
  if (!pid) throw new Error("database_backend_pid_unavailable");
  return pid;
}

export async function waitForDatabaseOperationBlockedBy(blockerPid: number) {
  await vi.waitFor(
    async () => {
      const result = await getDatabasePool().query<{ blocked: boolean }>(
        `SELECT EXISTS (
         SELECT 1
           FROM pg_stat_activity AS activity
          WHERE $1 = ANY(pg_blocking_pids(activity.pid))
       ) AS blocked`,
        [blockerPid],
      );
      if (!result.rows[0]?.blocked) {
        throw new Error("database_operation_not_blocked_yet");
      }
    },
    { interval: 10, timeout: 5_000 },
  );
}
