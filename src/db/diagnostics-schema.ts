import { boolean, index, jsonb, pgSchema, pgTable, primaryKey, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { getDatabaseSchemaName } from "./schema";
import type { DiagnosticEvent } from "@/lib/observability/diagnostics/store/schema";

const schema = getDatabaseSchemaName();
const operationColumns = {
  id: uuid("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  faulted: boolean("faulted").notNull().default(false),
  truncated: boolean("truncated").notNull().default(false),
};
const operationIndexes = (columns: { expiresAt: AnyPgColumn }) => [index("diagnostic_operations_expiry_idx").on(columns.expiresAt)];
export const diagnosticOperations = schema === "public" ? pgTable("diagnostic_operations",operationColumns,operationIndexes) : pgSchema(schema).table("diagnostic_operations",operationColumns,operationIndexes);

const eventColumns = {
  id: uuid("id").primaryKey(),
  diagnosticId: uuid("diagnostic_id").notNull().references(() => diagnosticOperations.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true }).notNull(),
  fault: boolean("fault").notNull(),
  fingerprint: text("fingerprint"),
  source: text("source").notNull(),
  requestId: uuid("request_id"),
  taskId: uuid("task_id"),
  payload: jsonb("payload").$type<DiagnosticEvent>().notNull(),
};
const eventIndexes = (columns: { diagnosticId: AnyPgColumn; at: AnyPgColumn; fault: AnyPgColumn; id: AnyPgColumn; requestId: AnyPgColumn; taskId: AnyPgColumn; fingerprint: AnyPgColumn; source: AnyPgColumn }) => [
  index("diagnostic_events_operation_idx").on(columns.diagnosticId, columns.at),
  index("diagnostic_events_recent_idx").on(columns.fault, columns.at, columns.id),
  index("diagnostic_events_request_idx").on(columns.requestId),
  index("diagnostic_events_task_idx").on(columns.taskId),
  index("diagnostic_events_group_idx").on(columns.fingerprint, columns.source, columns.at),
];
export const diagnosticEvents = schema === "public" ? pgTable("diagnostic_events",eventColumns,eventIndexes) : pgSchema(schema).table("diagnostic_events",eventColumns,eventIndexes);
const taskColumns = {
  diagnosticId: uuid("diagnostic_id").notNull().references(() => diagnosticOperations.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").notNull(),
  state: text("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
};
const taskIndexes = (columns: { diagnosticId: AnyPgColumn; taskId: AnyPgColumn }) => [primaryKey({ columns: [columns.diagnosticId, columns.taskId] })];
export const diagnosticTasks = schema === "public" ? pgTable("diagnostic_tasks",taskColumns,taskIndexes) : pgSchema(schema).table("diagnostic_tasks",taskColumns,taskIndexes);
export const diagnosticDatabaseTables = { diagnosticOperations, diagnosticEvents, diagnosticTasks };
