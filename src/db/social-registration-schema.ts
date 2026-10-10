import { sql } from "drizzle-orm";
import type { BuildExtraConfigColumns } from "drizzle-orm/column-builder";
import {
  boolean,
  check,
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

export type SocialRegistrationAttemptState =
  | "started"
  | "profile_captured"
  | "email_pending"
  | "email_verified"
  | "completed"
  | "expired"
  | "cancelled";

const schemaName = getDatabaseSchemaName();

const socialRegistrationAttemptColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull(),
  providerId: text("provider_id").notNull(),
  providerAccountId: text("provider_account_id"),
  providerEmail: text("provider_email"),
  providerEmailVerified: boolean("provider_email_verified")
    .notNull()
    .default(false),
  selectedEmail: text("selected_email"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  state: text("state")
    .$type<SocialRegistrationAttemptState>()
    .notNull()
    .default("started"),
  emailCodeHash: text("email_code_hash"),
  emailCodeExpiresAt: timestamp("email_code_expires_at", {
    withTimezone: true,
  }),
  emailCodeSentAt: timestamp("email_code_sent_at", { withTimezone: true }),
  emailCodeAttempts: integer("email_code_attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

type SocialRegistrationAttemptTable = BuildExtraConfigColumns<
  "account_social_registration_attempts",
  typeof socialRegistrationAttemptColumns,
  "pg"
>;

function socialRegistrationAttemptConstraints(
  table: SocialRegistrationAttemptTable,
) {
  return [
    uniqueIndex("account_social_registration_attempts_token_hash_unique").on(
      table.tokenHash,
    ),
    index("account_social_registration_attempts_provider_subject_idx").on(
      table.providerId,
      table.providerAccountId,
    ),
    index("account_social_registration_attempts_expiry_idx").on(
      table.expiresAt,
    ),
    check(
      "account_social_registration_attempts_provider_check",
      sql`${table.providerId} IN ('github')`,
    ),
    check(
      "account_social_registration_attempts_state_check",
      sql`${table.state} IN ('started', 'profile_captured', 'email_pending', 'email_verified', 'completed', 'expired', 'cancelled')`,
    ),
    check(
      "account_social_registration_attempts_email_attempts_check",
      sql`${table.emailCodeAttempts} >= 0`,
    ),
  ];
}

export const socialRegistrationAttempts = schemaName === "public"
  ? pgTable(
      "account_social_registration_attempts",
      socialRegistrationAttemptColumns,
      socialRegistrationAttemptConstraints,
    )
  : pgSchema(schemaName).table(
      "account_social_registration_attempts",
      socialRegistrationAttemptColumns,
      socialRegistrationAttemptConstraints,
    );

export const socialRegistrationDatabaseTables = {
  socialRegistrationAttempts,
};
