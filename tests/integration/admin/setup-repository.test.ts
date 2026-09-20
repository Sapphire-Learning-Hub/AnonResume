import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { db, instanceSetupState } from "@/db";
import {
  getInstanceSetupSnapshot,
  InstanceSetupStateIntegrityError,
  withInstanceSetupLock,
} from "@/lib/admin/setup/repository";
import { getDatabasePool } from "@/lib/runtime/database";

describe("instance setup repository", () => {
  beforeEach(async () => {
    await db.delete(instanceSetupState);
    await db.insert(instanceSetupState).values({
      slot: 1,
      state: "pending_initialization",
    });
  });

  it("reads the explicit singleton state", async () => {
    await expect(getInstanceSetupSnapshot()).resolves.toMatchObject({
      state: "pending_initialization",
      targetUserId: null,
      recoveryReason: null,
      completedAt: null,
      updatedAt: expect.any(Date),
    });
  });

  it("rejects a missing singleton instead of inferring setup state", async () => {
    await db.delete(instanceSetupState);

    await expect(getInstanceSetupSnapshot()).rejects.toBeInstanceOf(
      InstanceSetupStateIntegrityError,
    );
  });

  it("serializes setup transitions with a transaction-scoped lock", async () => {
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];

    const first = withInstanceSetupLock(async () => {
      order.push("first-entered");
      await firstMayFinish;
      order.push("first-finished");
    });
    await vi.waitFor(() => {
      expect(order).toContain("first-entered");
    });

    const second = withInstanceSetupLock(async (transaction) => {
      order.push("second-entered");
      return getInstanceSetupSnapshot(transaction);
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(order).toEqual(["first-entered"]);

    releaseFirst();
    await first;
    await expect(second).resolves.toMatchObject({
      state: "pending_initialization",
    });
    expect(order).toEqual([
      "first-entered",
      "first-finished",
      "second-entered",
    ]);
  });
});

describe("super-admin web setup migration", () => {
  it.each([
    ["empty database", "none", "pending_initialization"],
    ["active super-admin", "active", "completed"],
    ["pending legacy activation", "pending_activation", "completed"],
  ] as const)("backfills %s as %s", async (_label, fixture, expectedState) => {
    await expect(migrateFixture(fixture)).resolves.toMatchObject({
      activationTokenCount: fixture === "pending_activation" ? 1 : 0,
      state: expectedState,
    });
  });
});

async function migrateFixture(
  fixture: "none" | "active" | "pending_activation",
) {
  const schemaName = `setup_fixture_${randomUUID().replaceAll("-", "")}`;
  const client = await getDatabasePool().connect();

  try {
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}", public`);
    await client.query(`CREATE TABLE admin_principals (kind text NOT NULL)`);
    await client.query(
      `CREATE TABLE admin_activation_tokens (id text PRIMARY KEY, consumed_at timestamptz)`,
    );

    if (fixture !== "none") {
      await client.query(
        `INSERT INTO admin_principals (kind) VALUES ('super_admin')`,
      );
    }
    if (fixture === "pending_activation") {
      await client.query(
        `INSERT INTO admin_activation_tokens (id, consumed_at) VALUES ('legacy-token', NULL)`,
      );
    }

    const migration = await readFile(
      resolve(process.cwd(), "drizzle/0028_super_admin_web_setup.sql"),
      "utf8",
    );
    await client.query(migration.replaceAll("--> statement-breakpoint", ""));

    const stateResult = await client.query<{ state: string }>(
      `SELECT state FROM instance_setup_state WHERE slot = 1`,
    );
    const tokenResult = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM admin_activation_tokens`,
    );

    return {
      activationTokenCount: tokenResult.rows[0]?.count,
      state: stateResult.rows[0]?.state,
    };
  } finally {
    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    client.release();
  }
}
