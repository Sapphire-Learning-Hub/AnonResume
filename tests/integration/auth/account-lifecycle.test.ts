import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { accountLifecycle, db } from "@/db";
import {
  AccountLifecycleTransitionError,
  getAccountLifecycle,
  requestAccountDeletion,
  restorePendingAccount,
} from "@/lib/auth/account/repository";
import { assertActiveProductAccount } from "@/lib/auth/account/access";
import { getDatabasePool } from "@/lib/runtime/database";

describe("account lifecycle repository", () => {
  const userIds: string[] = [];

  function createUserId() {
    const userId = `account-lifecycle-${randomUUID()}`;
    userIds.push(userId);
    return userId;
  }

  async function createIdentity() {
    const userId = createUserId();
    const now = new Date("2026-10-09T12:00:00.000Z");
    await getDatabasePool().query(
      `INSERT INTO "user"
        (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, $4, $4)`,
      [userId, "Lifecycle user", `${userId}@example.com`, now],
    );
    return userId;
  }

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await db
        .delete(accountLifecycle)
        .where(eq(accountLifecycle.userId, userId));
      await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [userId]);
    }
  });

  it("treats an account without a lifecycle row as active", async () => {
    await expect(getAccountLifecycle(createUserId())).resolves.toMatchObject({
      status: "active",
      explicit: false,
      deletionRequestedAt: null,
      deletionDueAt: null,
      deletedAt: null,
    });
  });

  it("sets a seven-day recovery deadline when deletion is requested", async () => {
    const now = new Date("2026-10-07T08:30:00.000Z");

    await expect(
      requestAccountDeletion({ userId: createUserId(), now }),
    ).resolves.toMatchObject({
      status: "pending_deletion",
      explicit: true,
      deletionRequestedAt: now,
      deletionDueAt: new Date("2026-10-14T08:30:00.000Z"),
      deletedAt: null,
    });
  });

  it("restores an account only while its recovery deadline has not passed", async () => {
    const userId = createUserId();
    await requestAccountDeletion({
      userId,
      now: new Date("2026-10-07T00:00:00.000Z"),
    });

    await expect(
      restorePendingAccount({
        userId,
        now: new Date("2026-10-13T23:59:59.999Z"),
      }),
    ).resolves.toMatchObject({
      status: "active",
      deletionRequestedAt: null,
      deletionDueAt: null,
      deletedAt: null,
    });

    await requestAccountDeletion({
      userId,
      now: new Date("2026-10-07T00:00:00.000Z"),
    });
    await expect(
      restorePendingAccount({
        userId,
        now: new Date("2026-10-14T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(AccountLifecycleTransitionError);
  });

  it("serializes duplicate deletion requests into one stable transition", async () => {
    const userId = createUserId();
    const now = new Date("2026-10-07T00:00:00.000Z");

    const [first, second] = await Promise.all([
      requestAccountDeletion({ userId, now }),
      requestAccountDeletion({
        userId,
        now: new Date("2026-10-07T01:00:00.000Z"),
      }),
    ]);

    expect(first.deletionRequestedAt).toEqual(second.deletionRequestedAt);
    expect(first.deletionDueAt).toEqual(second.deletionDueAt);
  });

  it("treats a merged identity as terminal and records its destination", async () => {
    const userId = await createIdentity();
    const primaryUserId = await createIdentity();
    const mergedAt = new Date("2026-10-09T12:00:00.000Z");

    await db.execute(sql`
      INSERT INTO ${accountLifecycle}
        (user_id, status, merged_into_user_id, merged_at, created_at, updated_at)
      VALUES (${userId}, 'merged', ${primaryUserId}, ${mergedAt}, ${mergedAt}, ${mergedAt})
    `);

    await expect(getAccountLifecycle(userId)).resolves.toMatchObject({
      status: "merged",
      mergedIntoUserId: primaryUserId,
      mergedAt,
      deletionRequestedAt: null,
      deletionDueAt: null,
      deletedAt: null,
      explicit: true,
    });
    await expect(assertActiveProductAccount(userId)).rejects.toEqual(
      expect.objectContaining({ status: "merged" }),
    );
    await expect(requestAccountDeletion({ userId, now: mergedAt })).rejects
      .toBeInstanceOf(AccountLifecycleTransitionError);
    await expect(restorePendingAccount({ userId, now: mergedAt })).rejects
      .toBeInstanceOf(AccountLifecycleTransitionError);
  });
});
