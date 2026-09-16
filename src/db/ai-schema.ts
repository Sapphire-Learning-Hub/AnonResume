import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { getDatabaseSchemaName, resumes } from "./schema";

export type AiProviderKind = "platform" | "user";
export type AiConversationScope = "resume" | "section";
export type AiMessageRole = "user" | "assistant";
export type AiMessageCompletionState = "streaming" | "complete" | "stopped" | "failed";
export type AiRunStatus =
  | "preparing"
  | "streaming"
  | "complete"
  | "stopped"
  | "failed"
  | "interrupted"
  | "settlement_pending";
export type AiProposalCompletionState = "complete" | "incomplete" | "invalid";
export type AiLedgerEntryType =
  | "renewal"
  | "adjustment"
  | "reserve"
  | "settlement"
  | "release";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const schemaName = getDatabaseSchemaName();

const providerCredentialColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id"),
  kind: text("kind").$type<AiProviderKind>().notNull(),
  displayName: text("display_name").notNull(),
  baseUrl: text("base_url").notNull(),
  encryptedApiKey: bytea("encrypted_api_key").notNull(),
  encryptionKeyVersion: integer("encryption_key_version").notNull().default(1),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const aiProviderCredentials =
  schemaName === "public"
    ? pgTable("ai_provider_credentials", providerCredentialColumns, (table) => [
        check(
          "ai_provider_credentials_kind_check",
          sql`${table.kind} IN ('platform', 'user')`,
        ),
        check(
          "ai_provider_credentials_owner_check",
          sql`(${table.kind} = 'platform' AND ${table.ownerUserId} IS NULL) OR (${table.kind} = 'user' AND ${table.ownerUserId} IS NOT NULL)`,
        ),
        index("ai_provider_credentials_owner_idx").on(table.ownerUserId),
        uniqueIndex("ai_provider_credentials_user_owner_unique")
          .on(table.ownerUserId)
          .where(sql`${table.kind} = 'user'`),
      ])
    : pgSchema(schemaName).table(
        "ai_provider_credentials",
        providerCredentialColumns,
        (table) => [
          check(
            "ai_provider_credentials_kind_check",
            sql`${table.kind} IN ('platform', 'user')`,
          ),
          check(
            "ai_provider_credentials_owner_check",
            sql`(${table.kind} = 'platform' AND ${table.ownerUserId} IS NULL) OR (${table.kind} = 'user' AND ${table.ownerUserId} IS NOT NULL)`,
          ),
          index("ai_provider_credentials_owner_idx").on(table.ownerUserId),
          uniqueIndex("ai_provider_credentials_user_owner_unique")
            .on(table.ownerUserId)
            .where(sql`${table.kind} = 'user'`),
        ],
      );

const modelColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull(),
  providerModelKey: text("provider_model_key").notNull(),
  displayName: text("display_name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  supportsStreaming: boolean("supports_streaming").notNull().default(true),
  supportsToolCalls: boolean("supports_tool_calls").notNull().default(false),
  contextWindow: integer("context_window").notNull(),
  maxOutputTokens: integer("max_output_tokens").notNull(),
  inputPointRate: bigint("input_point_rate", { mode: "number" }).notNull(),
  cachedInputPointRate: bigint("cached_input_point_rate", { mode: "number" }).notNull(),
  outputPointRate: bigint("output_point_rate", { mode: "number" }).notNull(),
  rateCardVersion: integer("rate_card_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const aiModels =
  schemaName === "public"
    ? pgTable("ai_models", modelColumns, (table) => [
        foreignKey({
          columns: [table.providerId],
          foreignColumns: [aiProviderCredentials.id],
          name: "ai_models_provider_fk",
        }).onDelete("cascade"),
        uniqueIndex("ai_models_provider_key_unique").on(
          table.providerId,
          table.providerModelKey,
        ),
        check(
          "ai_models_limits_check",
          sql`${table.contextWindow} > 0 AND ${table.maxOutputTokens} > 0`,
        ),
        check(
          "ai_models_rates_check",
          sql`${table.inputPointRate} >= 0 AND ${table.cachedInputPointRate} >= 0 AND ${table.outputPointRate} >= 0`,
        ),
      ])
    : pgSchema(schemaName).table("ai_models", modelColumns, (table) => [
        foreignKey({
          columns: [table.providerId],
          foreignColumns: [aiProviderCredentials.id],
          name: "ai_models_provider_fk",
        }).onDelete("cascade"),
        uniqueIndex("ai_models_provider_key_unique").on(
          table.providerId,
          table.providerModelKey,
        ),
        check(
          "ai_models_limits_check",
          sql`${table.contextWindow} > 0 AND ${table.maxOutputTokens} > 0`,
        ),
        check(
          "ai_models_rates_check",
          sql`${table.inputPointRate} >= 0 AND ${table.cachedInputPointRate} >= 0 AND ${table.outputPointRate} >= 0`,
        ),
      ]);

const conversationColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  resumeId: text("resume_id").notNull(),
  title: text("title").notNull(),
  contextScope: text("context_scope").$type<AiConversationScope>().notNull(),
  sectionId: text("section_id"),
  modelId: uuid("model_id").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const aiConversations =
  schemaName === "public"
    ? pgTable("ai_conversations", conversationColumns, (table) => [
        foreignKey({
          columns: [table.userId, table.resumeId],
          foreignColumns: [resumes.userId, resumes.id],
          name: "ai_conversations_resume_fk",
        }).onDelete("cascade"),
        foreignKey({
          columns: [table.modelId],
          foreignColumns: [aiModels.id],
          name: "ai_conversations_model_fk",
        }),
        check(
          "ai_conversations_scope_check",
          sql`(${table.contextScope} = 'resume' AND ${table.sectionId} IS NULL) OR (${table.contextScope} = 'section' AND ${table.sectionId} IS NOT NULL)`,
        ),
        index("ai_conversations_user_resume_updated_idx").on(
          table.userId,
          table.resumeId,
          table.updatedAt.desc(),
        ),
      ])
    : pgSchema(schemaName).table(
        "ai_conversations",
        conversationColumns,
        (table) => [
          foreignKey({
            columns: [table.userId, table.resumeId],
            foreignColumns: [resumes.userId, resumes.id],
            name: "ai_conversations_resume_fk",
          }).onDelete("cascade"),
          foreignKey({
            columns: [table.modelId],
            foreignColumns: [aiModels.id],
            name: "ai_conversations_model_fk",
          }),
          check(
            "ai_conversations_scope_check",
            sql`(${table.contextScope} = 'resume' AND ${table.sectionId} IS NULL) OR (${table.contextScope} = 'section' AND ${table.sectionId} IS NOT NULL)`,
          ),
          index("ai_conversations_user_resume_updated_idx").on(
            table.userId,
            table.resumeId,
            table.updatedAt.desc(),
          ),
        ],
      );

const messageColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull(),
  role: text("role").$type<AiMessageRole>().notNull(),
  text: text("text").notNull().default(""),
  sequence: integer("sequence").notNull(),
  completionState: text("completion_state")
    .$type<AiMessageCompletionState>()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const aiMessages =
  schemaName === "public"
    ? pgTable("ai_messages", messageColumns, (table) => [
        foreignKey({
          columns: [table.conversationId],
          foreignColumns: [aiConversations.id],
          name: "ai_messages_conversation_fk",
        }).onDelete("cascade"),
        uniqueIndex("ai_messages_conversation_sequence_unique").on(
          table.conversationId,
          table.sequence,
        ),
        check(
          "ai_messages_role_check",
          sql`${table.role} IN ('user', 'assistant')`,
        ),
        check(
          "ai_messages_completion_check",
          sql`${table.completionState} IN ('streaming', 'complete', 'stopped', 'failed')`,
        ),
      ])
    : pgSchema(schemaName).table("ai_messages", messageColumns, (table) => [
        foreignKey({
          columns: [table.conversationId],
          foreignColumns: [aiConversations.id],
          name: "ai_messages_conversation_fk",
        }).onDelete("cascade"),
        uniqueIndex("ai_messages_conversation_sequence_unique").on(
          table.conversationId,
          table.sequence,
        ),
        check(
          "ai_messages_role_check",
          sql`${table.role} IN ('user', 'assistant')`,
        ),
        check(
          "ai_messages_completion_check",
          sql`${table.completionState} IN ('streaming', 'complete', 'stopped', 'failed')`,
        ),
      ]);

const runColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  resumeId: text("resume_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),
  assistantMessageId: uuid("assistant_message_id").notNull(),
  modelId: uuid("model_id").notNull(),
  keySource: text("key_source").$type<AiProviderKind>().notNull(),
  status: text("status").$type<AiRunStatus>().notNull(),
  resumeVersion: integer("resume_version").notNull(),
  contextHash: text("context_hash").notNull(),
  promptVersion: integer("prompt_version").notNull(),
  providerRequestId: text("provider_request_id"),
  checkpointSequence: integer("checkpoint_sequence").notNull().default(0),
  checkpointText: text("checkpoint_text").notNull().default(""),
  checkpointProposal: jsonb("checkpoint_proposal").$type<unknown>(),
  inputTokens: integer("input_tokens"),
  cachedInputTokens: integer("cached_input_tokens"),
  outputTokens: integer("output_tokens"),
  reservedPoints: bigint("reserved_points", { mode: "number" }).notNull().default(0),
  finalPoints: bigint("final_points", { mode: "number" }),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  stopRequestedAt: timestamp("stop_requested_at", { withTimezone: true }),
  failureCode: text("failure_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const aiRuns =
  schemaName === "public"
    ? pgTable("ai_runs", runColumns, (table) => [
        foreignKey({ columns: [table.conversationId], foreignColumns: [aiConversations.id], name: "ai_runs_conversation_fk" }).onDelete("cascade"),
        foreignKey({ columns: [table.assistantMessageId], foreignColumns: [aiMessages.id], name: "ai_runs_message_fk" }).onDelete("cascade"),
        foreignKey({ columns: [table.modelId], foreignColumns: [aiModels.id], name: "ai_runs_model_fk" }),
        check("ai_runs_status_check", sql`${table.status} IN ('preparing', 'streaming', 'complete', 'stopped', 'failed', 'interrupted', 'settlement_pending')`),
        check("ai_runs_points_check", sql`${table.reservedPoints} >= 0 AND (${table.finalPoints} IS NULL OR ${table.finalPoints} >= 0)`),
        uniqueIndex("ai_runs_active_user_resume_unique").on(table.userId, table.resumeId).where(sql`${table.status} IN ('preparing', 'streaming')`),
        index("ai_runs_status_lease_idx").on(table.status, table.leaseExpiresAt),
      ])
    : pgSchema(schemaName).table("ai_runs", runColumns, (table) => [
        foreignKey({ columns: [table.conversationId], foreignColumns: [aiConversations.id], name: "ai_runs_conversation_fk" }).onDelete("cascade"),
        foreignKey({ columns: [table.assistantMessageId], foreignColumns: [aiMessages.id], name: "ai_runs_message_fk" }).onDelete("cascade"),
        foreignKey({ columns: [table.modelId], foreignColumns: [aiModels.id], name: "ai_runs_model_fk" }),
        check("ai_runs_status_check", sql`${table.status} IN ('preparing', 'streaming', 'complete', 'stopped', 'failed', 'interrupted', 'settlement_pending')`),
        check("ai_runs_points_check", sql`${table.reservedPoints} >= 0 AND (${table.finalPoints} IS NULL OR ${table.finalPoints} >= 0)`),
        uniqueIndex("ai_runs_active_user_resume_unique").on(table.userId, table.resumeId).where(sql`${table.status} IN ('preparing', 'streaming')`),
        index("ai_runs_status_lease_idx").on(table.status, table.leaseExpiresAt),
      ]);

const proposalColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull(),
  baseResumeVersion: integer("base_resume_version").notNull(),
  targetHashes: jsonb("target_hashes").$type<Record<string, string>>().notNull(),
  proposal: jsonb("proposal").$type<unknown>().notNull(),
  completionState: text("completion_state")
    .$type<AiProposalCompletionState>()
    .notNull(),
  appliedChangeIds: jsonb("applied_change_ids").$type<string[]>().notNull().default([]),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const aiProposals =
  schemaName === "public"
    ? pgTable("ai_proposals", proposalColumns, (table) => [
        foreignKey({ columns: [table.runId], foreignColumns: [aiRuns.id], name: "ai_proposals_run_fk" }).onDelete("cascade"),
        uniqueIndex("ai_proposals_run_unique").on(table.runId),
        check("ai_proposals_completion_check", sql`${table.completionState} IN ('complete', 'incomplete', 'invalid')`),
      ])
    : pgSchema(schemaName).table("ai_proposals", proposalColumns, (table) => [
        foreignKey({ columns: [table.runId], foreignColumns: [aiRuns.id], name: "ai_proposals_run_fk" }).onDelete("cascade"),
        uniqueIndex("ai_proposals_run_unique").on(table.runId),
        check("ai_proposals_completion_check", sql`${table.completionState} IN ('complete', 'incomplete', 'invalid')`),
      ]);

const quotaAccountColumns = {
  userId: text("user_id").primaryKey(),
  monthlyLimit: bigint("monthly_limit", { mode: "number" }).notNull(),
  periodStartedAt: timestamp("period_started_at", { withTimezone: true }).notNull(),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }).notNull(),
  usedPoints: bigint("used_points", { mode: "number" }).notNull().default(0),
  reservedPoints: bigint("reserved_points", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const aiQuotaAccounts =
  schemaName === "public"
    ? pgTable("ai_quota_accounts", quotaAccountColumns, (table) => [
        check("ai_quota_accounts_period_check", sql`${table.periodEndsAt} > ${table.periodStartedAt}`),
        check("ai_quota_accounts_points_check", sql`${table.monthlyLimit} >= 0 AND ${table.usedPoints} >= 0 AND ${table.reservedPoints} >= 0`),
      ])
    : pgSchema(schemaName).table("ai_quota_accounts", quotaAccountColumns, (table) => [
        check("ai_quota_accounts_period_check", sql`${table.periodEndsAt} > ${table.periodStartedAt}`),
        check("ai_quota_accounts_points_check", sql`${table.monthlyLimit} >= 0 AND ${table.usedPoints} >= 0 AND ${table.reservedPoints} >= 0`),
      ]);

const ledgerColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  runId: uuid("run_id"),
  entryType: text("entry_type").$type<AiLedgerEntryType>().notNull(),
  pointsDelta: bigint("points_delta", { mode: "number" }).notNull(),
  inputTokens: integer("input_tokens"),
  cachedInputTokens: integer("cached_input_tokens"),
  outputTokens: integer("output_tokens"),
  modelId: uuid("model_id"),
  rateCardVersion: integer("rate_card_version"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const aiUsageLedger =
  schemaName === "public"
    ? pgTable("ai_usage_ledger", ledgerColumns, (table) => [
        foreignKey({ columns: [table.runId], foreignColumns: [aiRuns.id], name: "ai_usage_ledger_run_fk" }).onDelete("set null"),
        foreignKey({ columns: [table.modelId], foreignColumns: [aiModels.id], name: "ai_usage_ledger_model_fk" }).onDelete("set null"),
        check("ai_usage_ledger_type_check", sql`${table.entryType} IN ('renewal', 'adjustment', 'reserve', 'settlement', 'release')`),
        index("ai_usage_ledger_user_created_idx").on(table.userId, table.createdAt.desc()),
        index("ai_usage_ledger_run_idx").on(table.runId),
      ])
    : pgSchema(schemaName).table("ai_usage_ledger", ledgerColumns, (table) => [
        foreignKey({ columns: [table.runId], foreignColumns: [aiRuns.id], name: "ai_usage_ledger_run_fk" }).onDelete("set null"),
        foreignKey({ columns: [table.modelId], foreignColumns: [aiModels.id], name: "ai_usage_ledger_model_fk" }).onDelete("set null"),
        check("ai_usage_ledger_type_check", sql`${table.entryType} IN ('renewal', 'adjustment', 'reserve', 'settlement', 'release')`),
        index("ai_usage_ledger_user_created_idx").on(table.userId, table.createdAt.desc()),
        index("ai_usage_ledger_run_idx").on(table.runId),
      ]);

const auditPayloadColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull(),
  encryptedRequest: bytea("encrypted_request").notNull(),
  encryptedResponse: bytea("encrypted_response"),
  encryptionKeyVersion: integer("encryption_key_version").notNull().default(1),
  payloadHash: text("payload_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const aiAuditPayloads =
  schemaName === "public"
    ? pgTable("ai_audit_payloads", auditPayloadColumns, (table) => [
        foreignKey({ columns: [table.runId], foreignColumns: [aiRuns.id], name: "ai_audit_payloads_run_fk" }).onDelete("cascade"),
        uniqueIndex("ai_audit_payloads_run_unique").on(table.runId),
        index("ai_audit_payloads_expiry_idx").on(table.expiresAt),
      ])
    : pgSchema(schemaName).table("ai_audit_payloads", auditPayloadColumns, (table) => [
        foreignKey({ columns: [table.runId], foreignColumns: [aiRuns.id], name: "ai_audit_payloads_run_fk" }).onDelete("cascade"),
        uniqueIndex("ai_audit_payloads_run_unique").on(table.runId),
        index("ai_audit_payloads_expiry_idx").on(table.expiresAt),
      ]);

export const aiDatabaseTables = {
  aiProviderCredentials,
  aiModels,
  aiConversations,
  aiMessages,
  aiRuns,
  aiProposals,
  aiQuotaAccounts,
  aiUsageLedger,
  aiAuditPayloads,
};
