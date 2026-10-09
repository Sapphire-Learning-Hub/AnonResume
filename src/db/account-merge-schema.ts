import { sql } from "drizzle-orm";
import type { BuildExtraConfigColumns } from "drizzle-orm/column-builder";
import {
  check,
  foreignKey,
  index,
  integer,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { getDatabaseSchemaName } from "./schema";

export type AccountSocialLinkAttemptState =
  | "started"
  | "captured"
  | "collision"
  | "consumed"
  | "expired"
  | "cancelled";

export type AccountMergeOperationState =
  | "created"
  | "confirmed"
  | "waiting"
  | "merging"
  | "completed"
  | "cancelled"
  | "expired"
  | "failed";

export type AccountMergeNotificationEvent =
  | "merge_completed_primary"
  | "merge_completed_secondary"
  | "merge_timed_out"
  | "merge_failed";

export type AccountMergeNotificationState =
  | "pending"
  | "sending"
  | "delivered"
  | "failed";

const schemaName = getDatabaseSchemaName();

const socialLinkAttemptColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  initiatingUserId: text("initiating_user_id").notNull(),
  sessionBindingHash: text("session_binding_hash").notNull(),
  tokenHash: text("token_hash").notNull(),
  providerId: text("provider_id").notNull(),
  providerAccountId: text("provider_account_id"),
  state: text("state")
    .$type<AccountSocialLinkAttemptState>()
    .notNull()
    .default("started"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

type SocialLinkAttemptTable = BuildExtraConfigColumns<
  "account_social_link_attempts",
  typeof socialLinkAttemptColumns,
  "pg"
>;

function socialLinkAttemptConstraints(table: SocialLinkAttemptTable) {
  return [
    uniqueIndex("account_social_link_attempts_token_hash_unique").on(
      table.tokenHash,
    ),
    index("account_social_link_attempts_user_created_idx").on(
      table.initiatingUserId,
      table.createdAt.desc(),
    ),
    index("account_social_link_attempts_expiry_idx").on(table.expiresAt),
    check(
      "account_social_link_attempts_state_check",
      sql`${table.state} IN ('started', 'captured', 'collision', 'consumed', 'expired', 'cancelled')`,
    ),
  ];
}

export const accountSocialLinkAttempts = schemaName === "public"
  ? pgTable(
      "account_social_link_attempts",
      socialLinkAttemptColumns,
      socialLinkAttemptConstraints,
    )
  : pgSchema(schemaName).table(
      "account_social_link_attempts",
      socialLinkAttemptColumns,
      socialLinkAttemptConstraints,
    );

const mergeOperationColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  linkAttemptId: uuid("link_attempt_id").notNull(),
  initiatingUserId: text("initiating_user_id").notNull(),
  targetUserId: text("target_user_id").notNull(),
  primaryUserId: text("primary_user_id"),
  secondaryUserId: text("secondary_user_id"),
  providerId: text("provider_id").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  state: text("state")
    .$type<AccountMergeOperationState>()
    .notNull()
    .default("created"),
  confirmNotBefore: timestamp("confirm_not_before", {
    withTimezone: true,
  }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  waitDeadline: timestamp("wait_deadline", { withTimezone: true }),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  retryCount: integer("retry_count").notNull().default(0),
  statusTokenHash: text("status_token_hash").notNull(),
  locale: text("locale").$type<"zh-CN" | "en-US">().notNull(),
  sourceEmailMasked: text("source_email_masked"),
  sourceEmailDigest: text("source_email_digest"),
  failureCode: text("failure_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

type MergeOperationTable = BuildExtraConfigColumns<
  "account_merge_operations",
  typeof mergeOperationColumns,
  "pg"
>;

function mergeOperationConstraints(table: MergeOperationTable) {
  return [
    foreignKey({
      columns: [table.linkAttemptId],
      foreignColumns: [accountSocialLinkAttempts.id],
      name: "account_merge_operations_link_attempt_fk",
    }).onDelete("restrict"),
    uniqueIndex("account_merge_operations_link_attempt_unique").on(
      table.linkAttemptId,
    ),
    uniqueIndex("account_merge_operations_status_token_unique").on(
      table.statusTokenHash,
    ),
    index("account_merge_operations_state_deadline_idx").on(
      table.state,
      table.waitDeadline,
      table.leaseExpiresAt,
    ),
    check(
      "account_merge_operations_state_check",
      sql`${table.state} IN ('created', 'confirmed', 'waiting', 'merging', 'completed', 'cancelled', 'expired', 'failed')`,
    ),
    check(
      "account_merge_operations_locale_check",
      sql`${table.locale} IN ('zh-CN', 'en-US')`,
    ),
    check(
      "account_merge_operations_retry_count_check",
      sql`${table.retryCount} >= 0`,
    ),
  ];
}

export const accountMergeOperations = schemaName === "public"
  ? pgTable(
      "account_merge_operations",
      mergeOperationColumns,
      mergeOperationConstraints,
    )
  : pgSchema(schemaName).table(
      "account_merge_operations",
      mergeOperationColumns,
      mergeOperationConstraints,
    );

const mergeLockColumns = {
  userId: text("user_id").primaryKey(),
  operationId: uuid("operation_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

type MergeLockTable = BuildExtraConfigColumns<
  "account_merge_locks",
  typeof mergeLockColumns,
  "pg"
>;

function mergeLockConstraints(table: MergeLockTable) {
  return [
    foreignKey({
      columns: [table.operationId],
      foreignColumns: [accountMergeOperations.id],
      name: "account_merge_locks_operation_fk",
    }).onDelete("cascade"),
    index("account_merge_locks_operation_idx").on(table.operationId),
    index("account_merge_locks_expiry_idx").on(table.expiresAt),
  ];
}

export const accountMergeLocks = schemaName === "public"
  ? pgTable("account_merge_locks", mergeLockColumns, mergeLockConstraints)
  : pgSchema(schemaName).table(
      "account_merge_locks",
      mergeLockColumns,
      mergeLockConstraints,
    );

const mergeNotificationColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  operationId: uuid("operation_id").notNull(),
  recipientEmail: text("recipient_email"),
  recipientName: text("recipient_name"),
  event: text("event").$type<AccountMergeNotificationEvent>().notNull(),
  locale: text("locale").$type<"zh-CN" | "en-US">().notNull(),
  state: text("state")
    .$type<AccountMergeNotificationState>()
    .notNull()
    .default("pending"),
  attempts: integer("attempts").notNull().default(0),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

type MergeNotificationTable = BuildExtraConfigColumns<
  "account_merge_notification_outbox",
  typeof mergeNotificationColumns,
  "pg"
>;

function mergeNotificationConstraints(table: MergeNotificationTable) {
  return [
    foreignKey({
      columns: [table.operationId],
      foreignColumns: [accountMergeOperations.id],
      name: "account_merge_notification_outbox_operation_fk",
    }).onDelete("cascade"),
    index("account_merge_notification_outbox_state_idx").on(
      table.state,
      table.leaseExpiresAt,
      table.createdAt,
    ),
    check(
      "account_merge_notification_outbox_event_check",
      sql`${table.event} IN ('merge_completed_primary', 'merge_completed_secondary', 'merge_timed_out', 'merge_failed')`,
    ),
    check(
      "account_merge_notification_outbox_state_check",
      sql`${table.state} IN ('pending', 'sending', 'delivered', 'failed')`,
    ),
    check(
      "account_merge_notification_outbox_attempts_check",
      sql`${table.attempts} >= 0`,
    ),
  ];
}

export const accountMergeNotificationOutbox = schemaName === "public"
  ? pgTable(
      "account_merge_notification_outbox",
      mergeNotificationColumns,
      mergeNotificationConstraints,
    )
  : pgSchema(schemaName).table(
      "account_merge_notification_outbox",
      mergeNotificationColumns,
      mergeNotificationConstraints,
    );

export const accountMergeDatabaseTables = {
  accountSocialLinkAttempts,
  accountMergeOperations,
  accountMergeLocks,
  accountMergeNotificationOutbox,
};
