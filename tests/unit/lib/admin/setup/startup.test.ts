import { eq } from "drizzle-orm";

import {
  db,
  instanceSetupSessions,
  instanceSetupState,
  instanceSetupTokens,
} from "@/db";
import { hashAdminSecret } from "@/lib/admin/crypto";
import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";

describe("instance setup startup lifecycle", () => {
  beforeEach(async () => {
    await db.delete(instanceSetupSessions);
    await db.delete(instanceSetupTokens);
    await db.delete(instanceSetupState);
    await db.insert(instanceSetupState).values({
      slot: 1,
      state: "pending_initialization",
    });
  });

  it("does not generate a code after setup completes", async () => {
    await db
      .update(instanceSetupState)
      .set({ state: "completed", completedAt: new Date() })
      .where(eq(instanceSetupState.slot, 1));

    await expect(startup("web-1")).resolves.toEqual({
      state: "completed",
      generated: false,
    });
    await expect(db.select().from(instanceSetupTokens)).resolves.toEqual([]);
  });

  it("issues a hashed 30-minute code for a pending instance", async () => {
    const now = new Date("2026-09-21T00:00:00.000Z");
    const result = await startup("web-1", now);

    expect(result).toMatchObject({
      state: "pending_initialization",
      generated: true,
      rawCode: expect.any(String),
      generation: expect.any(String),
      expiresAt: new Date("2026-09-21T00:30:00.000Z"),
    });
    if (!result.generated) throw new Error("setup code was not generated");

    const rows = await db.select().from(instanceSetupTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceInstanceId: "production/web/web-1",
      generation: result.generation,
      tokenHash: hashAdminSecret(result.rawCode),
      expiresAt: result.expiresAt,
    });
    expect(JSON.stringify(rows)).not.toContain(result.rawCode);
  });

  it("replaces the same instance generation and invalidates its sessions", async () => {
    const first = await startup("web-1");
    if (!first.generated) throw new Error("setup code was not generated");
    await db.insert(instanceSetupSessions).values({
      tokenHash: "partial-session",
      generation: first.generation,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const second = await startup("web-1");
    if (!second.generated) throw new Error("setup code was not generated");

    expect(second.generation).not.toBe(first.generation);
    expect(second.rawCode).not.toBe(first.rawCode);
    await expect(
      db
        .select()
        .from(instanceSetupTokens)
        .where(eq(instanceSetupTokens.tokenHash, hashAdminSecret(first.rawCode))),
    ).resolves.toEqual([]);
    await expect(db.select().from(instanceSetupSessions)).resolves.toEqual([]);
  });

  it("keeps setup codes issued by separate web replicas", async () => {
    const first = await startup("web-1");
    const second = await startup("web-2");

    expect(first.generated && second.generated).toBe(true);
    expect(
      (await db.select().from(instanceSetupTokens)).map(
        (row) => row.sourceInstanceId,
      ),
    ).toEqual(["production/web/web-1", "production/web/web-2"]);
  });

  it("prunes expired codes and sessions during startup", async () => {
    const now = new Date("2026-09-21T00:00:00.000Z");
    await db.insert(instanceSetupTokens).values({
      sourceInstanceId: "production/web/dead-replica",
      generation: "26cf5339-e968-44e7-a729-64a4f29b3471",
      tokenHash: "expired-code",
      expiresAt: now,
    });
    await db.insert(instanceSetupSessions).values({
      tokenHash: "expired-session",
      generation: "26cf5339-e968-44e7-a729-64a4f29b3471",
      expiresAt: now,
    });

    await startup("web-1", now);

    await expect(
      db
        .select()
        .from(instanceSetupTokens)
        .where(eq(instanceSetupTokens.sourceInstanceId, "production/web/dead-replica")),
    ).resolves.toEqual([]);
    await expect(db.select().from(instanceSetupSessions)).resolves.toEqual([]);
  });
});

function startup(instanceId: string, now = new Date()) {
  return initializePendingInstanceSetup({
    identity: {
      stableId: `production/web/${instanceId}`,
    },
    now,
  });
}
