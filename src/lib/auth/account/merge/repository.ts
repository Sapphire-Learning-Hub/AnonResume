import { and, eq, gt } from "drizzle-orm";

import {
  accountMergeLocks,
  accountMergeOperations,
  accountSocialLinkAttempts,
  db,
  getDatabaseSchemaName,
} from "@/db";
import {
  getAdminPrincipalKindForAccountMerge,
  isAccountSuspended,
} from "@/lib/admin/store";
import { getAccountLifecycle } from "@/lib/auth/account/repository";
import { getDatabasePool } from "@/lib/runtime/database";

import { AccountMergeError } from "./errors";
import {
  createAccountMergeToken,
  digestAccountMergeEmail,
  hashAccountMergeToken,
  maskAccountMergeEmail,
  verifyAccountMergeToken,
} from "./tokens";
import type { AccountMergeAccountFacts } from "./types";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function projectTable(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

export type MergeAccountRecord = AccountMergeAccountFacts & {
  email: string;
  name: string;
  resumeCount: number;
  loginMethods: string[];
};

export async function getMergeAccountRecord(
  userId: string,
): Promise<MergeAccountRecord> {
  const pool = getDatabasePool();
  const [identity, accounts, resumes, lifecycle, suspended, adminKind] =
    await Promise.all([
      pool.query<{ email: string; name: string }>(
        `SELECT email, name FROM "user" WHERE id = $1 LIMIT 1`,
        [userId],
      ),
      pool.query<{ providerId: string; accountId: string; hasPassword: boolean }>(
        `SELECT "providerId" AS "providerId", "accountId" AS "accountId",
                (password IS NOT NULL) AS "hasPassword"
           FROM "account" WHERE "userId" = $1`,
        [userId],
      ),
      pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ${projectTable("resumes")}
          WHERE user_id = $1`,
        [userId],
      ),
      getAccountLifecycle(userId),
      isAccountSuspended(userId),
      getAdminPrincipalKindForAccountMerge(userId),
    ]);
  const user = identity.rows[0];
  if (!user) throw new AccountMergeError("account_unavailable");
  const credential = accounts.rows.find(
    (account) => account.providerId === "credential",
  );
  const loginMethods = [...new Set(accounts.rows.map(
    (account) => account.providerId,
  ))].sort((left, right) => {
    if (left === "credential") return -1;
    if (right === "credential") return 1;
    return left.localeCompare(right);
  });
  return {
    userId,
    email: user.email,
    name: user.name,
    lifecycleStatus: lifecycle.status,
    suspended,
    adminKind,
    hasPassword: Boolean(credential?.hasPassword),
    providerAccounts: accounts.rows.map((account) => ({
      providerId: account.providerId,
      accountId: account.accountId,
    })),
    resumeCount: resumes.rows[0]?.count ?? 0,
    loginMethods,
  };
}

export async function getCollisionIntent(input: {
  rawIntentToken: string;
  userId: string;
  sessionToken: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [attempt] = await db.select().from(accountSocialLinkAttempts).where(and(
    eq(
      accountSocialLinkAttempts.tokenHash,
      hashAccountMergeToken("link-attempt", input.rawIntentToken),
    ),
    eq(accountSocialLinkAttempts.initiatingUserId, input.userId),
    eq(accountSocialLinkAttempts.state, "collision"),
    gt(accountSocialLinkAttempts.expiresAt, now),
  )).limit(1);
  if (
    !attempt?.providerAccountId ||
    !verifyAccountMergeToken(
      "session-binding",
      input.sessionToken,
      attempt.sessionBindingHash,
    )
  ) {
    throw new AccountMergeError("intent_invalid");
  }
  const owner = await getDatabasePool().query<{ userId: string }>(
    `SELECT "userId" AS "userId" FROM "account"
      WHERE "providerId" = $1 AND "accountId" = $2 LIMIT 1`,
    [attempt.providerId, attempt.providerAccountId],
  );
  const targetUserId = owner.rows[0]?.userId;
  if (!targetUserId || targetUserId === input.userId) {
    throw new AccountMergeError("provider_ownership_changed");
  }
  return { attempt, targetUserId };
}

export async function createVerifiedMergeOperation(input: {
  attemptId: string;
  initiatingUserId: string;
  targetUserId: string;
  providerId: string;
  providerAccountId: string;
  locale: "zh-CN" | "en-US";
  now: Date;
}) {
  const statusToken = createAccountMergeToken("operation-status");
  const confirmNotBefore = new Date(input.now.getTime() + 5_000);
  const [operation] = await db.transaction(async (transaction) => {
    const consumed = await transaction.update(accountSocialLinkAttempts).set({
      state: "consumed",
      consumedAt: input.now,
      updatedAt: input.now,
    }).where(and(
      eq(accountSocialLinkAttempts.id, input.attemptId),
      eq(accountSocialLinkAttempts.state, "collision"),
    )).returning({ id: accountSocialLinkAttempts.id });
    if (consumed.length !== 1) throw new AccountMergeError("intent_invalid");
    return transaction.insert(accountMergeOperations).values({
      linkAttemptId: input.attemptId,
      initiatingUserId: input.initiatingUserId,
      targetUserId: input.targetUserId,
      providerId: input.providerId,
      providerAccountId: input.providerAccountId,
      state: "created",
      confirmNotBefore,
      statusTokenHash: statusToken.digest,
      locale: input.locale,
      createdAt: input.now,
      updatedAt: input.now,
    }).returning();
  });
  return { operation: operation!, rawStatusToken: statusToken.raw };
}

export async function getMergeOperationByStatusToken(rawStatusToken: string) {
  const [operation] = await db.select().from(accountMergeOperations).where(eq(
    accountMergeOperations.statusTokenHash,
    hashAccountMergeToken("operation-status", rawStatusToken),
  )).limit(1);
  if (!operation) throw new AccountMergeError("operation_invalid");
  return operation;
}

export async function cancelCreatedMergeOperation(input: {
  operationId: string;
  userId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.transaction(async (transaction) => {
    const [operation] = await transaction.select()
      .from(accountMergeOperations)
      .where(eq(accountMergeOperations.id, input.operationId))
      .for("update")
      .limit(1);
    if (!operation || operation.initiatingUserId !== input.userId) {
      throw new AccountMergeError("operation_invalid");
    }
    if (operation.state === "cancelled") return operation;
    if (operation.state !== "created") {
      throw new AccountMergeError("operation_invalid");
    }
    const [cancelled] = await transaction.update(accountMergeOperations).set({
      state: "cancelled",
      updatedAt: now,
    }).where(and(
      eq(accountMergeOperations.id, operation.id),
      eq(accountMergeOperations.state, "created"),
    )).returning();
    if (!cancelled) throw new AccountMergeError("operation_invalid");
    return cancelled;
  });
}

export async function confirmMergeOperation(input: {
  operationId: string;
  primaryUserId: string;
  secondaryUserId: string;
  secondaryEmail: string;
  now: Date;
}) {
  const waitDeadline = new Date(input.now.getTime() + 10 * 60 * 1000);
  try {
    return await db.transaction(async (transaction) => {
      const [operation] = await transaction.select()
        .from(accountMergeOperations)
        .where(eq(accountMergeOperations.id, input.operationId))
        .for("update")
        .limit(1);
      if (!operation) throw new AccountMergeError("operation_invalid");
      if (operation.confirmNotBefore > input.now) {
        throw new AccountMergeError("confirmation_too_early");
      }
      if (operation.state !== "created") {
        if (
          operation.primaryUserId === input.primaryUserId &&
          operation.secondaryUserId === input.secondaryUserId &&
          ["confirmed", "waiting", "merging", "completed"].includes(
            operation.state,
          )
        ) {
          return operation;
        }
        throw new AccountMergeError("operation_invalid");
      }

      await transaction.insert(accountMergeLocks).values([
        {
          userId: operation.initiatingUserId,
          operationId: operation.id,
          expiresAt: waitDeadline,
          createdAt: input.now,
        },
        {
          userId: operation.targetUserId,
          operationId: operation.id,
          expiresAt: waitDeadline,
          createdAt: input.now,
        },
      ]);
      const [confirmed] = await transaction.update(accountMergeOperations).set({
        primaryUserId: input.primaryUserId,
        secondaryUserId: input.secondaryUserId,
        sourceEmailMasked: maskAccountMergeEmail(input.secondaryEmail),
        sourceEmailDigest: digestAccountMergeEmail(input.secondaryEmail),
        state: "confirmed",
        confirmedAt: input.now,
        waitDeadline,
        updatedAt: input.now,
      }).where(and(
        eq(accountMergeOperations.id, operation.id),
        eq(accountMergeOperations.state, "created"),
      )).returning();
      if (!confirmed) throw new AccountMergeError("operation_invalid");
      return confirmed;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new AccountMergeError("merge_in_progress");
    }
    throw error;
  }
}

export async function getOperationProviderIdentity(operationId: string) {
  const [row] = await db.select({
    providerId: accountMergeOperations.providerId,
    providerAccountId: accountMergeOperations.providerAccountId,
    initiatingUserId: accountMergeOperations.initiatingUserId,
    targetUserId: accountMergeOperations.targetUserId,
  }).from(accountMergeOperations).where(eq(
    accountMergeOperations.id,
    operationId,
  )).limit(1);
  if (!row) throw new AccountMergeError("operation_invalid");
  return row;
}

export function summarizeMergeAccount(record: MergeAccountRecord) {
  return {
    email: maskAccountMergeEmail(record.email),
    name: record.name,
    resumeCount: record.resumeCount,
    loginMethods: record.loginMethods,
  };
}
