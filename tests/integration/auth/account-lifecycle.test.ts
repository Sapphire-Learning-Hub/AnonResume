import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { accountLifecycle, db } from "@/db";
import {
  AccountLifecycleTransitionError,
  getAccountLifecycle,
  requestAccountDeletion,
  restorePendingAccount,
} from "@/lib/auth/account/repository";

describe("account lifecycle repository", () => {
  const userIds: string[] = [];

  function createUserId() {
    const userId = `account-lifecycle-${randomUUID()}`;
    userIds.push(userId);
    return userId;
  }

  afterEach(async () => {
    for (const userId of userIds.splice(0)) {
      await db
        .delete(accountLifecycle)
        .where(eq(accountLifecycle.userId, userId));
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
});
