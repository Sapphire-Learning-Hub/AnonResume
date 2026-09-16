import { randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";
import {
  listAiAdminLedger,
  listAiAdminQuotas,
  updateAiAdminQuota,
} from "@/lib/ai/admin/service";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("AI administration service", () => {
  const marker = `ai-admin-${randomUUID()}`;
  const userId = `${marker}-user`;
  const actorUserId = `${marker}-actor`;
  const schema = quoteIdentifier(getDatabaseSchemaName());

  beforeAll(async () => {
    const pool = getDatabasePool();
    for (const [id, suffix] of [[userId, "user"], [actorUserId, "actor"]]) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, now(), now())`,
        [id, `${marker} ${suffix}`, `${marker}-${suffix}@example.com`],
      );
    }
  });

  afterAll(async () => {
    const pool = getDatabasePool();
    await pool.query(
      `DELETE FROM ${schema}.admin_audit_events WHERE actor_user_id = $1`,
      [actorUserId],
    );
    await pool.query(`DELETE FROM ${schema}.ai_usage_ledger WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM ${schema}.ai_quota_accounts WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [[userId, actorUserId]]);
  });

  it("updates a quota with immutable usage and management audit records", async () => {
    await updateAiAdminQuota({ actorUserId, userId, monthlyLimit: 24_000 });

    const quotas = await listAiAdminQuotas(
      { page: 1, pageSize: 10, query: `${marker}-user@example.com` },
      100_000,
    );
    expect(quotas.items).toEqual([
      expect.objectContaining({
        userId,
        monthlyLimit: "24000",
        customLimit: true,
      }),
    ]);

    const ledger = await listAiAdminLedger({
      page: 1,
      pageSize: 10,
      query: `${marker}-user@example.com`,
    });
    expect(ledger.items).toEqual([
      expect.objectContaining({ userId, entryType: "adjustment", pointsDelta: "0" }),
    ]);

    const audit = await getDatabasePool().query<{ action: string; metadata: unknown }>(
      `SELECT action, metadata FROM ${schema}.admin_audit_events
       WHERE actor_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [actorUserId],
    );
    expect(audit.rows[0]).toMatchObject({ action: "ai.quota.update" });
    expect(JSON.stringify(audit.rows[0]?.metadata)).not.toContain("content");
  });
});
