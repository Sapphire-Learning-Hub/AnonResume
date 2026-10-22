import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
  type ExtraConfigColumn,
} from "drizzle-orm/pg-core";

import { getDatabaseSchemaName } from "./schema";

const schemaName = getDatabaseSchemaName();
const templateColumns = {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  document: jsonb("document").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};
const templateConstraints = (t: {
  userId: AnyPgColumn;
  updatedAt: ExtraConfigColumn;
  id: ExtraConfigColumn;
  version: AnyPgColumn;
  name: AnyPgColumn;
}) => [
  index("resume_templates_owner_recent_idx").on(
    t.userId,
    t.updatedAt.desc(),
    t.id.desc(),
  ),
  check("resume_templates_version_check", sql`${t.version} > 0`),
  check(
    "resume_templates_name_check",
    sql`char_length(${t.name}) BETWEEN 1 AND 100 AND ${t.name} = btrim(${t.name})`,
  ),
];
export const resumeTemplates =
  schemaName === "public"
    ? pgTable("resume_templates", templateColumns, templateConstraints)
    : pgSchema(schemaName).table(
        "resume_templates",
        templateColumns,
        templateConstraints,
      );

const operationColumns = {
  userId: text("user_id").notNull(),
  operationId: text("operation_id").notNull(),
  kind: text("kind").$type<"save" | "replace" | "instantiate">().notNull(),
  requestHash: text("request_hash").notNull(),
  resultId: text("result_id").notNull(),
  resultVersion: integer("result_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};
const operationConstraints = (t: {
  userId: AnyPgColumn;
  operationId: AnyPgColumn;
  kind: AnyPgColumn;
}) => [
  primaryKey({ columns: [t.userId, t.operationId] }),
  check(
    "resume_template_operations_kind_check",
    sql`${t.kind} IN ('save', 'replace', 'instantiate')`,
  ),
];
export const resumeTemplateOperations =
  schemaName === "public"
    ? pgTable(
        "resume_template_operations",
        operationColumns,
        operationConstraints,
      )
    : pgSchema(schemaName).table(
        "resume_template_operations",
        operationColumns,
        operationConstraints,
      );

export const resumeTemplateDatabaseTables = {
  resumeTemplates,
  resumeTemplateOperations,
};
