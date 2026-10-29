import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  jobApplications,
  jobOpportunities,
  jobSearchOperations,
  accountLifecycle,
} from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";
import { createOpportunity } from "@/lib/job-search/opportunities";
import {
  transferJobSearchData,
  loadJobSearchExport,
} from "@/lib/job-search/account";
import { runAccountMaintenance } from "@/lib/auth/account/maintenance";
import { getApplication } from "@/lib/job-search/queries";
it("transfers all applications without deduplicating jobs and safely resolves idempotency key collisions", async () => {
  const primary = `jobs-primary-${randomUUID()}`,
    secondary = `jobs-secondary-${randomUUID()}`;
  const pool = getDatabasePool();
  for (const id of [primary, secondary])
    await pool.query(
      'INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES ($1,\'Transfer\',$2,true,now(),now())',
      [id, `${id}@example.test`],
    );
  try {
    const operationId = randomUUID();
    await createOpportunity(primary, { operationId, title: "Same name" });
    const second = await createOpportunity(secondary, {
      operationId,
      title: "Same name",
      description: "Secondary private JD",
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await transferJobSearchData(client, primary, secondary);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    expect((await loadJobSearchExport(primary)).opportunities).toHaveLength(2);
    expect((await loadJobSearchExport(secondary)).opportunities).toHaveLength(
      0,
    );
    expect(await getApplication(primary, second.applicationId!)).toMatchObject({
      snapshot: { description: "Secondary private JD" },
    });
    expect(
      await db
        .select()
        .from(jobSearchOperations)
        .where(eq(jobSearchOperations.userId, primary)),
    ).toHaveLength(2);
    await expect(
      getApplication(secondary, second.applicationId!),
    ).rejects.toThrow("not_found");
    await db.insert(accountLifecycle).values({
      userId: primary,
      status: "pending_deletion",
      deletionRequestedAt: new Date("2019-12-25T00:00:00Z"),
      deletionDueAt: new Date("2020-01-01T00:00:00Z"),
    });
    await expect(
      createOpportunity(primary, {
        operationId: randomUUID(),
        title: "Blocked",
      }),
    ).rejects.toThrow("account_unavailable");
    const result = await runAccountMaintenance({ now: new Date(), limit: 100 });
    expect(result.deleted).toBeGreaterThan(0);
    expect((await loadJobSearchExport(primary)).applications).toHaveLength(0);
    expect(
      await db
        .select()
        .from(jobSearchOperations)
        .where(eq(jobSearchOperations.userId, primary)),
    ).toHaveLength(0);
  } finally {
    for (const id of [primary, secondary]) {
      await db.delete(jobApplications).where(eq(jobApplications.userId, id));
      await db.delete(jobOpportunities).where(eq(jobOpportunities.userId, id));
      await db
        .delete(jobSearchOperations)
        .where(eq(jobSearchOperations.userId, id));
      await db.delete(accountLifecycle).where(eq(accountLifecycle.userId, id));
      await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
    }
  }
});
