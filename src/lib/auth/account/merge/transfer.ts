import { randomBytes } from "node:crypto";

import type { PoolClient } from "pg";

import { getDatabaseSchemaName } from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

import { AccountMergeError } from "./errors";
import { createMergedAccountEmail } from "./tokens";

const NOTICE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function table(name: string) {
  return `${quoteIdentifier(getDatabaseSchemaName())}.${quoteIdentifier(name)}`;
}

type MergeOperation = {
  id: string;
  state: string;
  initiatingUserId: string;
  targetUserId: string;
  primaryUserId: string | null;
  secondaryUserId: string | null;
  providerId: string;
  providerAccountId: string;
  locale: "zh-CN" | "en-US";
};

type Identity = {
  id: string;
  email: string;
  name: string;
};

async function lockParticipants(
  client: PoolClient,
  userIds: readonly string[],
) {
  const sorted = [...userIds].sort();
  for (const userId of sorted) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `anonresume:account-merge:${userId}`,
    ]);
  }
  const identities = await client.query<Identity>(
    `SELECT id, email, name FROM "user"
      WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE`,
    [sorted],
  );
  if (identities.rows.length !== 2) {
    throw new AccountMergeError("account_unavailable");
  }
  return new Map(identities.rows.map((identity) => [identity.id, identity]));
}

async function loadOperationForUpdate(
  client: PoolClient,
  operationId: string,
) {
  const result = await client.query<MergeOperation>(
    `SELECT id, state,
            initiating_user_id AS "initiatingUserId",
            target_user_id AS "targetUserId",
            primary_user_id AS "primaryUserId",
            secondary_user_id AS "secondaryUserId",
            provider_id AS "providerId",
            provider_account_id AS "providerAccountId",
            locale
       FROM ${table("account_merge_operations")}
      WHERE id = $1 FOR UPDATE`,
    [operationId],
  );
  const operation = result.rows[0];
  if (!operation) throw new AccountMergeError("operation_invalid");
  return operation;
}

function assertTransferableOperation(operation: MergeOperation) {
  if (operation.state === "completed") return;
  if (
    !["confirmed", "merging"].includes(operation.state) ||
    !operation.primaryUserId ||
    !operation.secondaryUserId ||
    operation.primaryUserId === operation.secondaryUserId ||
    ![operation.initiatingUserId, operation.targetUserId].includes(
      operation.primaryUserId,
    ) ||
    ![operation.initiatingUserId, operation.targetUserId].includes(
      operation.secondaryUserId,
    )
  ) {
    throw new AccountMergeError("operation_invalid");
  }
}

async function transferResumeData(
  client: PoolClient,
  primaryUserId: string,
  secondaryUserId: string,
  now: Date,
) {
  await client.query(
    `DELETE FROM ${table("onboarding_runs")} WHERE user_id = $1`,
    [secondaryUserId],
  );
  await client.query(
    `DELETE FROM ${table("resumes")}
      WHERE user_id = $1 AND kind = 'onboarding'`,
    [secondaryUserId],
  );
  await client.query(
    `UPDATE ${table("resumes")} SET user_id = $2, updated_at = $3
      WHERE user_id = $1`,
    [secondaryUserId, primaryUserId, now],
  );
  await client.query(
    `UPDATE ${table("pdf_export_jobs")} SET requester_user_id = $2
      WHERE requester_user_id = $1`,
    [secondaryUserId, primaryUserId],
  );
}

async function transferAiHistory(
  client: PoolClient,
  primaryUserId: string,
  secondaryUserId: string,
  now: Date,
) {
  await client.query(
    `UPDATE ${table("ai_runs")} SET user_id = $2, updated_at = $3
      WHERE user_id = $1`,
    [secondaryUserId, primaryUserId, now],
  );
  await client.query(
    `UPDATE ${table("ai_usage_ledger")} SET user_id = $2
      WHERE user_id = $1`,
    [secondaryUserId, primaryUserId],
  );
  await client.query(
    `DELETE FROM ${table("ai_quota_accounts")} WHERE user_id = $1`,
    [secondaryUserId],
  );

  const destroyedCiphertext = randomBytes(32);
  await client.query(
    `UPDATE ${table("ai_models")} AS model
        SET enabled = false, deleted_at = COALESCE(model.deleted_at, $2),
            updated_at = $2
       FROM ${table("ai_provider_credentials")} AS provider
      WHERE model.provider_id = provider.id AND provider.owner_user_id = $1`,
    [secondaryUserId, now],
  );
  await client.query(
    `UPDATE ${table("ai_provider_credentials")}
        SET encrypted_api_key = $2, enabled = false,
            deleted_at = COALESCE(deleted_at, $3), updated_at = $3
      WHERE owner_user_id = $1`,
    [secondaryUserId, destroyedCiphertext, now],
  );
}

async function invalidateSecondaryState(
  client: PoolClient,
  secondaryUserId: string,
  now: Date,
) {
  await client.query(
    `DELETE FROM ${table("account_email_challenges")} WHERE user_id = $1`,
    [secondaryUserId],
  );
  await client.query(
    `DELETE FROM ${table("account_restrictions")} WHERE user_id = $1`,
    [secondaryUserId],
  );
  await client.query(`DELETE FROM "verification" WHERE value = $1`, [
    secondaryUserId,
  ]);
  await client.query(
    `UPDATE ${table("user_invitations")}
        SET token_hash = NULL, invalidated_at = $2,
            invalidation_reason = 'inviter_account_merged', updated_at = $2
      WHERE inviter_user_id = $1 AND accepted_at IS NULL
        AND revoked_at IS NULL AND invalidated_at IS NULL`,
    [secondaryUserId, now],
  );
}

async function transferAuthorizingIdentity(
  client: PoolClient,
  operation: MergeOperation,
  now: Date,
) {
  const transferred = await client.query(
    `UPDATE "account" SET "userId" = $4, "updatedAt" = $5
      WHERE "userId" = $1 AND "providerId" = $2 AND "accountId" = $3
      RETURNING id`,
    [
      operation.targetUserId,
      operation.providerId,
      operation.providerAccountId,
      operation.primaryUserId,
      now,
    ],
  );
  if (transferred.rowCount !== 1) {
    throw new AccountMergeError("provider_ownership_changed");
  }
  await client.query(`DELETE FROM "account" WHERE "userId" = $1`, [
    operation.secondaryUserId,
  ]);
}

async function assertParticipantsRemainEligible(
  client: PoolClient,
  operation: MergeOperation,
  now: Date,
) {
  const userIds = [operation.initiatingUserId, operation.targetUserId];
  const lifecycle = await client.query<{ userId: string; status: string }>(
    `SELECT identity.id AS "userId", COALESCE(lifecycle.status, 'active') AS status
       FROM "user" AS identity
       LEFT JOIN ${table("account_lifecycle")} AS lifecycle
         ON lifecycle.user_id = identity.id
      WHERE identity.id = ANY($1::text[])`,
    [userIds],
  );
  if (
    lifecycle.rows.length !== 2 ||
    lifecycle.rows.some((row) => row.status !== "active")
  ) {
    throw new AccountMergeError("account_unavailable");
  }

  const restrictions = await client.query(
    `SELECT user_id FROM ${table("account_restrictions")}
      WHERE user_id = ANY($1::text[]) AND suspended_at <= $2
        AND (suspended_until IS NULL OR suspended_until > $2)`,
    [userIds, now],
  );
  if (restrictions.rowCount) {
    throw new AccountMergeError("account_unavailable");
  }

  const principals = await client.query<{ userId: string; kind: string }>(
    `SELECT user_id AS "userId", kind FROM ${table("admin_principals")}
      WHERE user_id = ANY($1::text[])`,
    [userIds],
  );
  if (principals.rows.some((row) => row.kind === "quarantined_admin")) {
    throw new AccountMergeError("account_unavailable");
  }
  const initiatingIsAdmin = principals.rows.some((row) =>
    row.userId === operation.initiatingUserId &&
    ["super_admin", "delegated_admin"].includes(row.kind)
  );
  const targetIsAdmin = principals.rows.some((row) =>
    row.userId === operation.targetUserId &&
    ["super_admin", "delegated_admin"].includes(row.kind)
  );
  if (targetIsAdmin) throw new AccountMergeError("target_is_administrator");
  if (initiatingIsAdmin && operation.primaryUserId !== operation.initiatingUserId) {
    throw new AccountMergeError("administrator_must_be_primary");
  }

  const credentials = await client.query<{ userId: string }>(
    `SELECT "userId" AS "userId" FROM "account"
      WHERE "userId" = ANY($1::text[]) AND "providerId" = 'credential'
        AND password IS NOT NULL FOR UPDATE`,
    [userIds],
  );
  if (new Set(credentials.rows.map((row) => row.userId)).size !== 2) {
    throw new AccountMergeError("password_unavailable");
  }
}

async function revokeAccountAccess(
  client: PoolClient,
  userIds: readonly string[],
) {
  await client.query(`DELETE FROM "session" WHERE "userId" = ANY($1::text[])`, [
    userIds,
  ]);
  await client.query(
    `DELETE FROM ${table("admin_sessions")} WHERE user_id = ANY($1::text[])`,
    [userIds],
  );
}

async function tombstoneSecondaryIdentity(
  client: PoolClient,
  primaryUserId: string,
  secondaryUserId: string,
  now: Date,
) {
  await client.query(
    `UPDATE "user" SET email = $2, name = 'Merged account', image = NULL,
                       "emailVerified" = false, "updatedAt" = $3
      WHERE id = $1`,
    [secondaryUserId, createMergedAccountEmail(secondaryUserId), now],
  );
  await client.query(
    `INSERT INTO ${table("account_lifecycle")}
      (user_id, status, deletion_requested_at, deletion_due_at, deleted_at,
       merged_into_user_id, merged_at, created_at, updated_at)
     VALUES ($1, 'merged', NULL, NULL, NULL, $2, $3, $3, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       status = 'merged', deletion_requested_at = NULL, deletion_due_at = NULL,
       deleted_at = NULL, merged_into_user_id = EXCLUDED.merged_into_user_id,
       merged_at = EXCLUDED.merged_at, updated_at = EXCLUDED.updated_at`,
    [secondaryUserId, primaryUserId, now],
  );
}

async function enqueueCompletionNotices(
  client: PoolClient,
  operation: MergeOperation,
  primary: Identity,
  secondary: Identity,
  now: Date,
) {
  const expiresAt = new Date(now.getTime() + NOTICE_RETENTION_MS);
  await client.query(
    `INSERT INTO ${table("account_merge_notification_outbox")}
      (operation_id, recipient_email, recipient_name, event, locale,
       expires_at, created_at, updated_at)
     VALUES
      ($1, $2, $3, 'merge_completed_primary', $6, $7, $5, $5),
      ($1, $4, $8, 'merge_completed_secondary', $6, $7, $5, $5)`,
    [
      operation.id,
      primary.email,
      primary.name,
      secondary.email,
      now,
      operation.locale,
      expiresAt,
      secondary.name,
    ],
  );
}

async function runTransfer(
  client: PoolClient,
  operationId: string,
  now: Date,
) {
  const operation = await loadOperationForUpdate(client, operationId);
  assertTransferableOperation(operation);
  if (operation.state === "completed") return { state: "completed" as const };

  const primaryUserId = operation.primaryUserId!;
  const secondaryUserId = operation.secondaryUserId!;
  const identities = await lockParticipants(client, [
    primaryUserId,
    secondaryUserId,
  ]);
  const primary = identities.get(primaryUserId)!;
  const secondary = identities.get(secondaryUserId)!;
  await assertParticipantsRemainEligible(client, operation, now);

  await client.query(
    `UPDATE ${table("account_merge_operations")}
        SET state = 'merging', started_at = COALESCE(started_at, $2),
            updated_at = $2
      WHERE id = $1`,
    [operation.id, now],
  );
  await transferResumeData(client, primaryUserId, secondaryUserId, now);
  await transferAiHistory(client, primaryUserId, secondaryUserId, now);
  await invalidateSecondaryState(client, secondaryUserId, now);
  await transferAuthorizingIdentity(client, operation, now);
  await revokeAccountAccess(client, [primaryUserId, secondaryUserId]);
  await tombstoneSecondaryIdentity(
    client,
    primaryUserId,
    secondaryUserId,
    now,
  );
  await enqueueCompletionNotices(
    client,
    operation,
    primary,
    secondary,
    now,
  );
  await client.query(
    `UPDATE ${table("account_merge_operations")}
        SET state = 'completed', completed_at = $2, lease_owner = NULL,
            lease_expires_at = NULL, failure_code = NULL, updated_at = $2
      WHERE id = $1`,
    [operation.id, now],
  );
  await client.query(
    `DELETE FROM ${table("account_merge_locks")} WHERE operation_id = $1`,
    [operation.id],
  );
  return { state: "completed" as const };
}

export async function executeAccountMergeTransfer(input: {
  operationId: string;
  now?: Date;
}) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await runTransfer(
      client,
      input.operationId,
      input.now ?? new Date(),
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
