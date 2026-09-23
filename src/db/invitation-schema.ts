import {
  index,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { getDatabaseSchemaName } from "./schema";

export type UserInvitationInvalidationReason =
  | "registered_independently"
  | "accepted_via_other_invitation";

const schemaName = getDatabaseSchemaName();

const invitationColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  inviterUserId: text("inviter_user_id").notNull(),
  invitedEmail: text("invited_email").notNull(),
  tokenHash: text("token_hash"),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedByUserId: text("accepted_by_user_id"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  invalidationReason: text("invalidation_reason").$type<UserInvitationInvalidationReason>(),
  legacyInvitedUserId: text("legacy_invited_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const userInvitations =
  schemaName === "public"
    ? pgTable("user_invitations", invitationColumns, (table) => [
        index("user_invitations_inviter_created_idx").on(
          table.inviterUserId,
          table.createdAt.desc(),
        ),
        index("user_invitations_email_idx").on(table.invitedEmail),
        uniqueIndex("user_invitations_token_hash_unique").on(table.tokenHash),
        uniqueIndex("user_invitations_legacy_user_unique").on(
          table.legacyInvitedUserId,
        ),
      ])
    : pgSchema(schemaName).table(
        "user_invitations",
        invitationColumns,
        (table) => [
          index("user_invitations_inviter_created_idx").on(
            table.inviterUserId,
            table.createdAt.desc(),
          ),
          index("user_invitations_email_idx").on(table.invitedEmail),
          uniqueIndex("user_invitations_token_hash_unique").on(table.tokenHash),
          uniqueIndex("user_invitations_legacy_user_unique").on(
            table.legacyInvitedUserId,
          ),
        ],
      );

export const invitationDatabaseTables = { userInvitations };
