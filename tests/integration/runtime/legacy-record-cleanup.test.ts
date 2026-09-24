import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getDatabasePool } from "@/lib/runtime/database";

describe("legacy runtime record cleanup migration", () => {
  it("removes only stale random-ID records", async () => {
    const client = await getDatabasePool().connect();
    const stale = new Date(Date.now() - 10 * 60_000);
    const recent = new Date(Date.now() - 60_000);
    const legacyUuid = "e84b028b-12f9-4c06-bc97-82a1eb9d6c7d";
    const recentUuid = "91582440-9736-4520-8c55-b911d075b5d8";
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0030_cleanup_legacy_runtime_records.sql"),
      "utf8",
    );

    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TEMP TABLE system_config_runtime_states (
          instance_id text PRIMARY KEY,
          last_seen_at timestamptz NOT NULL
        ) ON COMMIT DROP
      `);
      await client.query(`
        CREATE TEMP TABLE worker_heartbeats (
          worker_id text PRIMARY KEY,
          last_seen_at timestamptz NOT NULL
        ) ON COMMIT DROP
      `);
      await client.query("SET LOCAL search_path = pg_temp");

      for (const [instanceId, lastSeenAt] of [
        [legacyUuid, stale],
        [recentUuid, recent],
        ["default/web/host", stale],
      ] as const) {
        await client.query(
          "INSERT INTO system_config_runtime_states (instance_id, last_seen_at) VALUES ($1, $2)",
          [instanceId, lastSeenAt],
        );
      }
      for (const [workerId, lastSeenAt] of [
        [`host:123:${legacyUuid}`, stale],
        [`host:456:${recentUuid}`, recent],
        ["default/ai-worker/host", stale],
      ] as const) {
        await client.query(
          "INSERT INTO worker_heartbeats (worker_id, last_seen_at) VALUES ($1, $2)",
          [workerId, lastSeenAt],
        );
      }

      await client.query(migration);
      const runtimeStates = await client.query<{ instance_id: string }>(
        "SELECT instance_id FROM system_config_runtime_states ORDER BY instance_id",
      );
      const workerHeartbeats = await client.query<{ worker_id: string }>(
        "SELECT worker_id FROM worker_heartbeats ORDER BY worker_id",
      );

      expect(runtimeStates.rows.map((row) => row.instance_id)).toEqual([
        recentUuid,
        "default/web/host",
      ]);
      expect(workerHeartbeats.rows.map((row) => row.worker_id)).toEqual([
        "default/ai-worker/host",
        `host:456:${recentUuid}`,
      ]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
