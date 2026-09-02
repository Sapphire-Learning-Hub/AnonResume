import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { ResumeDocument } from "@/domain/resume/schema";

export type PdfExportJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export function getDatabaseSchemaName() {
  return process.env.ANONRESUME_DB_SCHEMA || "public";
}

const schemaName = getDatabaseSchemaName();

const resumeColumns = {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  summary: text("summary").notNull(),
  customSummary: text("custom_summary"),
  slug: text("slug"),
  document: jsonb("document").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  version: integer("version").notNull().default(1),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const resumes =
  schemaName === "public"
    ? pgTable("resumes", resumeColumns, (table) => [
        primaryKey({
          columns: [table.userId, table.id],
        }),
        uniqueIndex("resumes_generated_id_unique")
          .on(table.id)
          .where(sql`${table.id} ~ '^resume-[0-9]{8}-[0-9]{6}-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`),
        uniqueIndex("resumes_slug_unique").on(table.slug),
      ])
    : pgSchema(schemaName).table("resumes", resumeColumns, (table) => [
        primaryKey({
          columns: [table.userId, table.id],
        }),
        uniqueIndex("resumes_generated_id_unique")
          .on(table.id)
          .where(sql`${table.id} ~ '^resume-[0-9]{8}-[0-9]{6}-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`),
        uniqueIndex("resumes_slug_unique").on(table.slug),
      ]);

const resumeVersionColumns = {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  resumeId: text("resume_id").notNull(),
  version: integer("version").notNull(),
  document: jsonb("document").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const resumeVersions =
  schemaName === "public"
    ? pgTable("resume_versions", resumeVersionColumns, (table) => [
        primaryKey({
          columns: [table.id],
        }),
        foreignKey({
          columns: [table.userId, table.resumeId],
          foreignColumns: [resumes.userId, resumes.id],
          name: "resume_versions_resume_fk",
        }).onDelete("cascade"),
      ])
    : pgSchema(schemaName).table("resume_versions", resumeVersionColumns, (table) => [
        primaryKey({
          columns: [table.id],
        }),
        foreignKey({
          columns: [table.userId, table.resumeId],
          foreignColumns: [resumes.userId, resumes.id],
          name: "resume_versions_resume_fk",
        }).onDelete("cascade"),
      ]);

const pdfExportJobColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  resumeUserId: text("resume_user_id").notNull(),
  resumeId: text("resume_id").notNull(),
  requesterUserId: text("requester_user_id"),
  accessTokenHash: text("access_token_hash").notNull(),
  status: text("status").$type<PdfExportJobStatus>().notNull().default("queued"),
  document: jsonb("document").$type<ResumeDocument>().notNull(),
  filename: text("filename").notNull(),
  result: bytea("result"),
  error: text("error"),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  workerId: text("worker_id"),
  attempts: integer("attempts").notNull().default(0),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  resultExpiresAt: timestamp("result_expires_at", { withTimezone: true }),
};

export const pdfExportJobs =
  schemaName === "public"
    ? pgTable("pdf_export_jobs", pdfExportJobColumns, (table) => [
        foreignKey({
          columns: [table.resumeUserId, table.resumeId],
          foreignColumns: [resumes.userId, resumes.id],
          name: "pdf_export_jobs_resume_fk",
        }).onDelete("cascade"),
        check(
          "pdf_export_jobs_status_check",
          sql`${table.status} IN ('queued', 'running', 'completed', 'failed', 'cancelled')`,
        ),
        index("pdf_export_jobs_status_created_at_idx").on(
          table.status,
          table.createdAt,
        ),
        index("pdf_export_jobs_requester_created_at_idx").on(
          table.requesterUserId,
          table.createdAt,
        ),
      ])
    : pgSchema(schemaName).table("pdf_export_jobs", pdfExportJobColumns, (table) => [
        foreignKey({
          columns: [table.resumeUserId, table.resumeId],
          foreignColumns: [resumes.userId, resumes.id],
          name: "pdf_export_jobs_resume_fk",
        }).onDelete("cascade"),
        check(
          "pdf_export_jobs_status_check",
          sql`${table.status} IN ('queued', 'running', 'completed', 'failed', 'cancelled')`,
        ),
        index("pdf_export_jobs_status_created_at_idx").on(
          table.status,
          table.createdAt,
        ),
        index("pdf_export_jobs_requester_created_at_idx").on(
          table.requesterUserId,
          table.createdAt,
        ),
      ]);
