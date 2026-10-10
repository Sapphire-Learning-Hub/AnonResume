import { and, eq, gt, sql } from "drizzle-orm";

import { accountLifecycle, db } from "@/db";

import type { AccountLifecycleSnapshot } from "./types";

const ACCOUNT_DELETION_COOLING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const ACCOUNT_LIFECYCLE_LOCK_PREFIX = "anonresume:account-deletion:";

type AccountTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AccountLifecycleRow = typeof accountLifecycle.$inferSelect;

export class AccountLifecycleTransitionError extends Error {
  constructor(message: "account_not_pending" | "recovery_period_ended") {
    super(message);
    this.name = "AccountLifecycleTransitionError";
  }
}

function mapLifecycleRow(
  row: AccountLifecycleRow | undefined,
): AccountLifecycleSnapshot {
  if (!row) {
    return {
      status: "active",
      deletionRequestedAt: null,
      deletionDueAt: null,
      deletedAt: null,
      mergedIntoUserId: null,
      mergedAt: null,
      explicit: false,
    };
  }

  return {
    status: row.status,
    deletionRequestedAt: row.deletionRequestedAt,
    deletionDueAt: row.deletionDueAt,
    deletedAt: row.deletedAt,
    mergedIntoUserId: row.mergedIntoUserId,
    mergedAt: row.mergedAt,
    explicit: true,
  };
}

async function findLifecycle(
  executor: typeof db | AccountTransaction,
  userId: string,
) {
  const [row] = await executor
    .select()
    .from(accountLifecycle)
    .where(eq(accountLifecycle.userId, userId))
    .limit(1);
  return row;
}

async function withAccountLifecycleLock<T>(
  userId: string,
  callback: (transaction: AccountTransaction) => Promise<T>,
) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${ACCOUNT_LIFECYCLE_LOCK_PREFIX}${userId}`}))`,
    );
    return callback(transaction);
  });
}

export async function getAccountLifecycle(userId: string) {
  return mapLifecycleRow(await findLifecycle(db, userId));
}

export async function requestAccountDeletion(input: {
  userId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  return withAccountLifecycleLock(input.userId, async (transaction) => {
    const current = await findLifecycle(transaction, input.userId);
    if (current?.status === "deleted" || current?.status === "merged") {
      throw new AccountLifecycleTransitionError("account_not_pending");
    }
    if (current?.status === "pending_deletion") {
      return mapLifecycleRow(current);
    }

    const deletionDueAt = new Date(
      now.getTime() + ACCOUNT_DELETION_COOLING_PERIOD_MS,
    );
    const [row] = await transaction
      .insert(accountLifecycle)
      .values({
        userId: input.userId,
        status: "pending_deletion",
        deletionRequestedAt: now,
        deletionDueAt,
        deletedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: accountLifecycle.userId,
        set: {
          status: "pending_deletion",
          deletionRequestedAt: now,
          deletionDueAt,
          deletedAt: null,
          updatedAt: now,
        },
        setWhere: eq(accountLifecycle.status, "active"),
      })
      .returning();

    if (row) return mapLifecycleRow(row);
    return mapLifecycleRow(await findLifecycle(transaction, input.userId));
  });
}

export async function restorePendingAccount(input: {
  userId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  return withAccountLifecycleLock(input.userId, async (transaction) => {
    const current = await findLifecycle(transaction, input.userId);
    if (current?.status !== "pending_deletion") {
      throw new AccountLifecycleTransitionError("account_not_pending");
    }
    if (!current.deletionDueAt || current.deletionDueAt <= now) {
      throw new AccountLifecycleTransitionError("recovery_period_ended");
    }

    const [row] = await transaction
      .update(accountLifecycle)
      .set({
        status: "active",
        deletionRequestedAt: null,
        deletionDueAt: null,
        deletedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(accountLifecycle.userId, input.userId),
          eq(accountLifecycle.status, "pending_deletion"),
          gt(accountLifecycle.deletionDueAt, now),
        ),
      )
      .returning();

    if (!row) {
      throw new AccountLifecycleTransitionError("recovery_period_ended");
    }
    return mapLifecycleRow(row);
  });
}
