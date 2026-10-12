import { sql } from "drizzle-orm";
import type { BuildExtraConfigColumns } from "drizzle-orm/column-builder";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { EncryptedConfigSecret } from "@/lib/config/crypto";
import type { ConfigConsumer } from "@/lib/config/types";
import type { RuntimeSupervisorKind } from "@/lib/runtime/restart/supervisor";

import { getDatabaseSchemaName } from "./schema";

export type SystemConfigRevisionStatus = "draft" | "active" | "superseded";
export type SystemConfigHealthState =
  | "healthy"
  | "restart_required"
  | "degraded"
  | "recovery_required";
export type RuntimeInstanceStatus = "running" | "stopped";
export type SystemRestartOperationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out";
export type SystemRestartTargetStatus =
  | "queued"
  | "draining"
  | "exiting"
  | "awaiting_startup"
  | "healthy"
  | "failed"
  | "timed_out";

const schemaName = getDatabaseSchemaName();

const revisionColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull(),
  status: text("status").$type<SystemConfigRevisionStatus>().notNull(),
  baseRevisionId: uuid("base_revision_id"),
  summary: text("summary"),
  createdByUserId: text("created_by_user_id").notNull(),
  publishedByUserId: text("published_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
};

export const systemConfigRevisions =
  schemaName === "public"
    ? pgTable("system_config_revisions", revisionColumns, (table) => [
        check(
          "system_config_revisions_status_check",
          sql`${table.status} IN ('draft', 'active', 'superseded')`,
        ),
        uniqueIndex("system_config_revisions_version_unique").on(table.version),
        uniqueIndex("system_config_revisions_active_unique")
          .on(table.status)
          .where(sql`${table.status} = 'active'`),
        uniqueIndex("system_config_revisions_draft_unique")
          .on(table.status)
          .where(sql`${table.status} = 'draft'`),
      ])
    : pgSchema(schemaName).table(
        "system_config_revisions",
        revisionColumns,
        (table) => [
          check(
            "system_config_revisions_status_check",
            sql`${table.status} IN ('draft', 'active', 'superseded')`,
          ),
          uniqueIndex("system_config_revisions_version_unique").on(table.version),
          uniqueIndex("system_config_revisions_active_unique")
            .on(table.status)
            .where(sql`${table.status} = 'active'`),
          uniqueIndex("system_config_revisions_draft_unique")
            .on(table.status)
            .where(sql`${table.status} = 'draft'`),
        ],
      );

const valueColumns = {
  revisionId: uuid("revision_id").notNull(),
  key: text("key").notNull(),
  valueJson: jsonb("value_json").$type<unknown>(),
  encryptedValue: jsonb("encrypted_value").$type<EncryptedConfigSecret>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const systemConfigValues =
  schemaName === "public"
    ? pgTable("system_config_values", valueColumns, (table) => [
        primaryKey({ columns: [table.revisionId, table.key] }),
        foreignKey({
          columns: [table.revisionId],
          foreignColumns: [systemConfigRevisions.id],
          name: "system_config_values_revision_fk",
        }).onDelete("cascade"),
        check(
          "system_config_values_payload_check",
          sql`(${table.valueJson} IS NULL) <> (${table.encryptedValue} IS NULL)`,
        ),
      ])
    : pgSchema(schemaName).table("system_config_values", valueColumns, (table) => [
        primaryKey({ columns: [table.revisionId, table.key] }),
        foreignKey({
          columns: [table.revisionId],
          foreignColumns: [systemConfigRevisions.id],
          name: "system_config_values_revision_fk",
        }).onDelete("cascade"),
        check(
          "system_config_values_payload_check",
          sql`(${table.valueJson} IS NULL) <> (${table.encryptedValue} IS NULL)`,
        ),
      ]);

const runtimeStateColumns = {
  instanceId: text("instance_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  consumer: text("consumer").$type<ConfigConsumer>().notNull(),
  release: text("release").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  desiredRevisionId: uuid("desired_revision_id"),
  loadedHotRevisionId: uuid("loaded_hot_revision_id"),
  loadedRestartRevisionId: uuid("loaded_restart_revision_id"),
  fallbackRevisionId: uuid("fallback_revision_id"),
  healthState: text("health_state")
    .$type<SystemConfigHealthState>()
    .notNull()
    .default("healthy"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  status: text("status")
    .$type<RuntimeInstanceStatus>()
    .notNull()
    .default("running"),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  lastError: text("last_error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
};

export const systemConfigRuntimeStates =
  schemaName === "public"
    ? pgTable(
        "system_config_runtime_states",
        runtimeStateColumns,
        (table) => [
          check(
            "system_config_runtime_states_consumer_check",
            sql`${table.consumer} IN ('web', 'pdf-worker', 'ai-worker')`,
          ),
          check(
            "system_config_runtime_states_health_check",
            sql`${table.healthState} IN ('healthy', 'restart_required', 'degraded', 'recovery_required')`,
          ),
          check(
            "system_config_runtime_states_status_check",
            sql`${table.status} IN ('running', 'stopped')`,
          ),
          index("system_config_runtime_states_consumer_seen_idx").on(
            table.consumer,
            table.lastSeenAt,
          ),
          foreignKey({
            columns: [table.desiredRevisionId],
            foreignColumns: [systemConfigRevisions.id],
            name: "system_config_runtime_states_desired_revision_fk",
          }).onDelete("set null"),
          foreignKey({
            columns: [table.loadedHotRevisionId],
            foreignColumns: [systemConfigRevisions.id],
            name: "system_config_runtime_states_loaded_hot_revision_fk",
          }).onDelete("set null"),
          foreignKey({
            columns: [table.loadedRestartRevisionId],
            foreignColumns: [systemConfigRevisions.id],
            name: "system_config_runtime_states_loaded_restart_revision_fk",
          }).onDelete("set null"),
          foreignKey({
            columns: [table.fallbackRevisionId],
            foreignColumns: [systemConfigRevisions.id],
            name: "system_config_runtime_states_fallback_revision_fk",
          }).onDelete("set null"),
        ],
      )
    : pgSchema(schemaName).table(
        "system_config_runtime_states",
        runtimeStateColumns,
        (table) => [
          check(
            "system_config_runtime_states_consumer_check",
            sql`${table.consumer} IN ('web', 'pdf-worker', 'ai-worker')`,
          ),
          check(
            "system_config_runtime_states_health_check",
            sql`${table.healthState} IN ('healthy', 'restart_required', 'degraded', 'recovery_required')`,
          ),
          check(
            "system_config_runtime_states_status_check",
            sql`${table.status} IN ('running', 'stopped')`,
          ),
          index("system_config_runtime_states_consumer_seen_idx").on(
            table.consumer,
            table.lastSeenAt,
          ),
          foreignKey({
            columns: [table.desiredRevisionId],
            foreignColumns: [systemConfigRevisions.id],
            name: "system_config_runtime_states_desired_revision_fk",
          }).onDelete("set null"),
          foreignKey({
            columns: [table.loadedHotRevisionId],
            foreignColumns: [systemConfigRevisions.id],
            name: "system_config_runtime_states_loaded_hot_revision_fk",
          }).onDelete("set null"),
          foreignKey({
            columns: [table.loadedRestartRevisionId],
            foreignColumns: [systemConfigRevisions.id],
            name: "system_config_runtime_states_loaded_restart_revision_fk",
          }).onDelete("set null"),
          foreignKey({
            columns: [table.fallbackRevisionId],
            foreignColumns: [systemConfigRevisions.id],
            name: "system_config_runtime_states_fallback_revision_fk",
          }).onDelete("set null"),
        ],
      );

const restartOperationColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  deploymentId: text("deployment_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  desiredRevisionId: uuid("desired_revision_id").notNull(),
  status: text("status")
    .$type<SystemRestartOperationStatus>()
    .notNull()
    .default("queued"),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

type RestartOperationTable = BuildExtraConfigColumns<
  "system_restart_operations",
  typeof restartOperationColumns,
  "pg"
>;

function restartOperationConstraints(table: RestartOperationTable) {
  return [
    foreignKey({
      columns: [table.desiredRevisionId],
      foreignColumns: [systemConfigRevisions.id],
      name: "system_restart_operations_desired_revision_fk",
    }).onDelete("restrict"),
    uniqueIndex("system_restart_operations_actor_idempotency_unique").on(
      table.actorUserId,
      table.idempotencyKey,
    ),
    uniqueIndex("system_restart_operations_deployment_active_unique")
      .on(table.deploymentId)
      .where(sql`${table.status} IN ('queued', 'running')`),
    index("system_restart_operations_deployment_created_idx").on(
      table.deploymentId,
      table.createdAt.desc(),
    ),
    check(
      "system_restart_operations_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'timed_out')`,
    ),
  ];
}

export const systemRestartOperations = schemaName === "public"
  ? pgTable(
      "system_restart_operations",
      restartOperationColumns,
      restartOperationConstraints,
    )
  : pgSchema(schemaName).table(
      "system_restart_operations",
      restartOperationColumns,
      restartOperationConstraints,
    );

const restartTargetColumns = {
  operationId: uuid("operation_id").notNull(),
  instanceId: text("instance_id").notNull(),
  consumer: text("consumer").$type<ConfigConsumer>().notNull(),
  sequence: integer("sequence").notNull(),
  expectedSessionId: text("expected_session_id").notNull(),
  desiredRestartRevisionId: uuid("desired_restart_revision_id").notNull(),
  supervisorKind: text("supervisor_kind").$type<RuntimeSupervisorKind>().notNull(),
  status: text("status")
    .$type<SystemRestartTargetStatus>()
    .notNull()
    .default("queued"),
  errorCode: text("error_code"),
  drainStartedAt: timestamp("drain_started_at", { withTimezone: true }),
  exitStartedAt: timestamp("exit_started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

type RestartTargetTable = BuildExtraConfigColumns<
  "system_restart_targets",
  typeof restartTargetColumns,
  "pg"
>;

function restartTargetConstraints(table: RestartTargetTable) {
  return [
    primaryKey({ columns: [table.operationId, table.instanceId] }),
    foreignKey({
      columns: [table.operationId],
      foreignColumns: [systemRestartOperations.id],
      name: "system_restart_targets_operation_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.desiredRestartRevisionId],
      foreignColumns: [systemConfigRevisions.id],
      name: "system_restart_targets_desired_revision_fk",
    }).onDelete("restrict"),
    uniqueIndex("system_restart_targets_operation_sequence_unique").on(
      table.operationId,
      table.sequence,
    ),
    check(
      "system_restart_targets_consumer_check",
      sql`${table.consumer} IN ('web', 'pdf-worker', 'ai-worker')`,
    ),
    check(
      "system_restart_targets_supervisor_check",
      sql`${table.supervisorKind} IN ('docker-compose', 'systemd')`,
    ),
    check(
      "system_restart_targets_status_check",
      sql`${table.status} IN ('queued', 'draining', 'exiting', 'awaiting_startup', 'healthy', 'failed', 'timed_out')`,
    ),
    check(
      "system_restart_targets_sequence_check",
      sql`${table.sequence} >= 0`,
    ),
  ];
}

export const systemRestartTargets = schemaName === "public"
  ? pgTable(
      "system_restart_targets",
      restartTargetColumns,
      restartTargetConstraints,
    )
  : pgSchema(schemaName).table(
      "system_restart_targets",
      restartTargetColumns,
      restartTargetConstraints,
    );

export const configDatabaseTables = {
  systemConfigRevisions,
  systemConfigValues,
  systemConfigRuntimeStates,
  systemRestartOperations,
  systemRestartTargets,
};
