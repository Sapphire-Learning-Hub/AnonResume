import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import * as database from "@/db";

function requireTable(value: unknown): PgTable {
  expect(value).toBeDefined();
  return value as PgTable;
}

describe("account merge database schema", () => {
  it("exports the complete passive merge persistence model", () => {
    expect(Object.keys(database)).toEqual(expect.arrayContaining([
      "accountSocialLinkAttempts",
      "accountMergeOperations",
      "accountMergeLocks",
      "accountMergeNotificationOutbox",
    ]));
  });

  it("binds social link attempts to a session and provider subject", () => {
    const table = requireTable(database.accountSocialLinkAttempts);
    const columns = getTableColumns(table);
    const config = getTableConfig(table);

    expect(Object.keys(columns)).toEqual(expect.arrayContaining([
      "initiatingUserId",
      "sessionBindingHash",
      "tokenHash",
      "providerId",
      "providerAccountId",
      "state",
      "expiresAt",
      "consumedAt",
    ]));
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "account_social_link_attempts_token_hash_unique",
        "account_social_link_attempts_expiry_idx",
      ]),
    );
    expect(config.checks.map((constraint) => constraint.name)).toContain(
      "account_social_link_attempts_state_check",
    );
  });

  it("stores durable operation deadlines, leases, and safe audit details", () => {
    const table = requireTable(database.accountMergeOperations);
    const columns = getTableColumns(table);
    const config = getTableConfig(table);

    expect(Object.keys(columns)).toEqual(expect.arrayContaining([
      "linkAttemptId",
      "initiatingUserId",
      "targetUserId",
      "primaryUserId",
      "secondaryUserId",
      "providerId",
      "providerAccountId",
      "state",
      "confirmNotBefore",
      "waitDeadline",
      "leaseOwner",
      "leaseExpiresAt",
      "retryCount",
      "statusTokenHash",
      "locale",
      "sourceEmailMasked",
      "sourceEmailDigest",
      "failureCode",
      "completedAt",
    ]));
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "account_merge_operations_link_attempt_unique",
        "account_merge_operations_status_token_unique",
        "account_merge_operations_state_deadline_idx",
      ]),
    );
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "account_merge_operations_state_check",
        "account_merge_operations_locale_check",
      ]),
    );
  });

  it("locks each participant once and queues redacting notifications", () => {
    const lockTable = requireTable(database.accountMergeLocks);
    const outboxTable = requireTable(database.accountMergeNotificationOutbox);
    const lockColumns = getTableColumns(lockTable);
    const outboxColumns = getTableColumns(outboxTable);
    const outboxConfig = getTableConfig(outboxTable);

    expect(lockColumns.userId?.primary).toBe(true);
    expect(Object.keys(lockColumns)).toEqual(expect.arrayContaining([
      "userId",
      "operationId",
      "expiresAt",
    ]));
    expect(Object.keys(outboxColumns)).toEqual(expect.arrayContaining([
      "operationId",
      "recipientEmail",
      "recipientName",
      "event",
      "locale",
      "state",
      "attempts",
      "leaseOwner",
      "leaseExpiresAt",
      "expiresAt",
      "deliveredAt",
    ]));
    expect(outboxConfig.indexes.map((index) => index.config.name)).toContain(
      "account_merge_notification_outbox_state_idx",
    );
    expect(outboxConfig.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "account_merge_notification_outbox_event_check",
        "account_merge_notification_outbox_state_check",
      ]),
    );
  });
});
