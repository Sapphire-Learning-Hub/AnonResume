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
  pgTable,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { ResumeDocument } from "@/domain/resume/schema";
import type {
  AdminPermission,
  AdminSystemRoleKey,
} from "@/lib/admin/permissions";
import type { InstanceSetupState } from "@/lib/admin/setup/types";
import type {
  AnnouncementAudience,
  AnnouncementStatus,
  AnnouncementTone,
} from "@/lib/announcements/rules";
import {
  readBootstrapDatabaseSchema,
  type BootstrapConfigInput,
} from "@/lib/config/bootstrap";

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

export function getDatabaseSchemaName(input: BootstrapConfigInput = {}) {
  return readBootstrapDatabaseSchema(input);
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
        uniqueIndex("resumes_id_unique").on(table.id),
        uniqueIndex("resumes_slug_unique").on(table.slug),
        index("resumes_user_updated_id_idx").on(
          table.userId,
          table.updatedAt.desc(),
          table.id.asc(),
        ),
      ])
    : pgSchema(schemaName).table("resumes", resumeColumns, (table) => [
        primaryKey({
          columns: [table.userId, table.id],
        }),
        uniqueIndex("resumes_id_unique").on(table.id),
        uniqueIndex("resumes_slug_unique").on(table.slug),
        index("resumes_user_updated_id_idx").on(
          table.userId,
          table.updatedAt.desc(),
          table.id.asc(),
        ),
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
        index("resume_versions_resume_created_id_idx").on(
          table.userId,
          table.resumeId,
          table.createdAt.desc(),
          table.id.desc(),
        ),
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
        index("resume_versions_resume_created_id_idx").on(
          table.userId,
          table.resumeId,
          table.createdAt.desc(),
          table.id.desc(),
        ),
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

export type AdminPrincipalKind =
  | "super_admin"
  | "delegated_admin"
  | "quarantined_admin";

const announcementColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  titleZh: text("title_zh").notNull(),
  bodyZh: text("body_zh").notNull(),
  titleEn: text("title_en"),
  bodyEn: text("body_en"),
  tone: text("tone").$type<AnnouncementTone>().notNull().default("info"),
  audience: text("audience")
    .$type<AnnouncementAudience>()
    .notNull()
    .default("all"),
  dismissible: boolean("dismissible").notNull().default(true),
  status: text("status")
    .$type<AnnouncementStatus>()
    .notNull()
    .default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdByUserId: text("created_by_user_id"),
  updatedByUserId: text("updated_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const announcements =
  schemaName === "public"
    ? pgTable("announcements", announcementColumns, (table) => [
        check(
          "announcements_tone_check",
          sql`${table.tone} IN ('info', 'warning', 'critical')`,
        ),
        check(
          "announcements_audience_check",
          sql`${table.audience} IN ('all', 'authenticated')`,
        ),
        check(
          "announcements_status_check",
          sql`${table.status} IN ('draft', 'published', 'withdrawn')`,
        ),
        check(
          "announcements_english_copy_check",
          sql`(${table.titleEn} IS NULL AND ${table.bodyEn} IS NULL) OR (${table.titleEn} IS NOT NULL AND ${table.bodyEn} IS NOT NULL)`,
        ),
        index("announcements_active_idx").on(
          table.status,
          table.tone,
          table.publishedAt.desc(),
        ),
      ])
    : pgSchema(schemaName).table(
        "announcements",
        announcementColumns,
        (table) => [
          check(
            "announcements_tone_check",
            sql`${table.tone} IN ('info', 'warning', 'critical')`,
          ),
          check(
            "announcements_audience_check",
            sql`${table.audience} IN ('all', 'authenticated')`,
          ),
          check(
            "announcements_status_check",
            sql`${table.status} IN ('draft', 'published', 'withdrawn')`,
          ),
          check(
            "announcements_english_copy_check",
            sql`(${table.titleEn} IS NULL AND ${table.bodyEn} IS NULL) OR (${table.titleEn} IS NOT NULL AND ${table.bodyEn} IS NOT NULL)`,
          ),
          index("announcements_active_idx").on(
            table.status,
            table.tone,
            table.publishedAt.desc(),
          ),
        ],
      );

const adminPrincipalColumns = {
  userId: text("user_id").primaryKey(),
  kind: text("kind").$type<AdminPrincipalKind>().notNull(),
  singletonSlot: integer("singleton_slot"),
  accessVersion: integer("access_version").notNull().default(1),
  quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const adminPrincipals =
  schemaName === "public"
    ? pgTable("admin_principals", adminPrincipalColumns, (table) => [
        uniqueIndex("admin_principals_singleton_slot_unique").on(
          table.singletonSlot,
        ),
        check(
          "admin_principals_kind_slot_check",
          sql`(${table.kind} = 'super_admin' AND ${table.singletonSlot} = 1) OR (${table.kind} IN ('delegated_admin', 'quarantined_admin') AND ${table.singletonSlot} IS NULL)`,
        ),
      ])
    : pgSchema(schemaName).table(
        "admin_principals",
        adminPrincipalColumns,
        (table) => [
          uniqueIndex("admin_principals_singleton_slot_unique").on(
            table.singletonSlot,
          ),
          check(
            "admin_principals_kind_slot_check",
            sql`(${table.kind} = 'super_admin' AND ${table.singletonSlot} = 1) OR (${table.kind} IN ('delegated_admin', 'quarantined_admin') AND ${table.singletonSlot} IS NULL)`,
          ),
        ],
      );

const adminRoleColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  permissions: jsonb("permissions").$type<AdminPermission[]>().notNull(),
  systemKey: text("system_key").$type<AdminSystemRoleKey>(),
  createdByUserId: text("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const adminRoles =
  schemaName === "public"
    ? pgTable("admin_roles", adminRoleColumns, (table) => [
        uniqueIndex("admin_roles_name_unique")
          .on(sql`lower(${table.name})`)
          .where(sql`${table.systemKey} IS NULL`),
        uniqueIndex("admin_roles_system_key_unique").on(table.systemKey),
        check(
          "admin_roles_system_key_check",
          sql`${table.systemKey} IS NULL OR ${table.systemKey} IN ('read_only_auditor', 'support_operator', 'content_reviewer', 'system_operator', 'ai_service_manager')`,
        ),
        check(
          "admin_roles_origin_check",
          sql`(${table.systemKey} IS NULL AND ${table.createdByUserId} IS NOT NULL) OR (${table.systemKey} IS NOT NULL AND ${table.createdByUserId} IS NULL)`,
        ),
      ])
    : pgSchema(schemaName).table("admin_roles", adminRoleColumns, (table) => [
        uniqueIndex("admin_roles_name_unique")
          .on(sql`lower(${table.name})`)
          .where(sql`${table.systemKey} IS NULL`),
        uniqueIndex("admin_roles_system_key_unique").on(table.systemKey),
        check(
          "admin_roles_system_key_check",
          sql`${table.systemKey} IS NULL OR ${table.systemKey} IN ('read_only_auditor', 'support_operator', 'content_reviewer', 'system_operator', 'ai_service_manager')`,
        ),
        check(
          "admin_roles_origin_check",
          sql`(${table.systemKey} IS NULL AND ${table.createdByUserId} IS NOT NULL) OR (${table.systemKey} IS NOT NULL AND ${table.createdByUserId} IS NULL)`,
        ),
      ]);

const adminAssignmentColumns = {
  userId: text("user_id").notNull(),
  roleId: uuid("role_id").notNull(),
  assignedByUserId: text("assigned_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const adminAssignments =
  schemaName === "public"
    ? pgTable("admin_assignments", adminAssignmentColumns, (table) => [
        primaryKey({
          columns: [table.userId, table.roleId],
          name: "admin_assignments_user_role_pk",
        }),
        foreignKey({
          columns: [table.roleId],
          foreignColumns: [adminRoles.id],
          name: "admin_assignments_role_fk",
        }).onDelete("restrict"),
      ])
    : pgSchema(schemaName).table(
        "admin_assignments",
        adminAssignmentColumns,
        (table) => [
          primaryKey({
            columns: [table.userId, table.roleId],
            name: "admin_assignments_user_role_pk",
          }),
          foreignKey({
            columns: [table.roleId],
            foreignColumns: [adminRoles.id],
            name: "admin_assignments_role_fk",
          }).onDelete("restrict"),
        ],
      );

const adminMfaDeviceColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  encryptedSecret: text("encrypted_secret").notNull(),
  encryptionIv: text("encryption_iv").notNull(),
  encryptionTag: text("encryption_tag").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  lastAcceptedStep: bigint("last_accepted_step", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
};

export const adminMfaDevices =
  schemaName === "public"
    ? pgTable("admin_mfa_devices", adminMfaDeviceColumns, (table) => [
        index("admin_mfa_devices_user_id_idx").on(table.userId),
        uniqueIndex("admin_mfa_devices_user_name_unique").on(
          table.userId,
          sql`lower(${table.name})`,
        ),
      ])
    : pgSchema(schemaName).table(
        "admin_mfa_devices",
        adminMfaDeviceColumns,
        (table) => [
          index("admin_mfa_devices_user_id_idx").on(table.userId),
          uniqueIndex("admin_mfa_devices_user_name_unique").on(
            table.userId,
            sql`lower(${table.name})`,
          ),
        ],
      );

const adminRecoveryCodeColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  codeHash: text("code_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
};

export const adminRecoveryCodes =
  schemaName === "public"
    ? pgTable("admin_recovery_codes", adminRecoveryCodeColumns, (table) => [
        index("admin_recovery_codes_user_id_idx").on(table.userId),
        uniqueIndex("admin_recovery_codes_hash_unique").on(table.codeHash),
      ])
    : pgSchema(schemaName).table(
        "admin_recovery_codes",
        adminRecoveryCodeColumns,
        (table) => [
          index("admin_recovery_codes_user_id_idx").on(table.userId),
          uniqueIndex("admin_recovery_codes_hash_unique").on(table.codeHash),
        ],
      );

const adminSecurityStateColumns = {
  userId: text("user_id").primaryKey(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  recoveryRequired: boolean("recovery_required").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const adminSecurityStates =
  schemaName === "public"
    ? pgTable("admin_security_states", adminSecurityStateColumns)
    : pgSchema(schemaName).table(
        "admin_security_states",
        adminSecurityStateColumns,
      );

export type AdminMfaResetRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired";

const adminMfaResetRequestColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterUserId: text("requester_user_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status")
    .$type<AdminMfaResetRequestStatus>()
    .notNull()
    .default("pending"),
  reviewerUserId: text("reviewer_user_id"),
  reviewReason: text("review_reason"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const adminMfaResetRequests =
  schemaName === "public"
    ? pgTable("admin_mfa_reset_requests", adminMfaResetRequestColumns, (table) => [
        check(
          "admin_mfa_reset_requests_status_check",
          sql`${table.status} IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')`,
        ),
        uniqueIndex("admin_mfa_reset_requests_requester_pending_unique")
          .on(table.requesterUserId)
          .where(sql`${table.status} = 'pending'`),
        index("admin_mfa_reset_requests_status_created_idx").on(
          table.status,
          table.createdAt.desc(),
        ),
        index("admin_mfa_reset_requests_requester_created_idx").on(
          table.requesterUserId,
          table.createdAt.desc(),
        ),
      ])
    : pgSchema(schemaName).table(
        "admin_mfa_reset_requests",
        adminMfaResetRequestColumns,
        (table) => [
          check(
            "admin_mfa_reset_requests_status_check",
            sql`${table.status} IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')`,
          ),
          uniqueIndex("admin_mfa_reset_requests_requester_pending_unique")
            .on(table.requesterUserId)
            .where(sql`${table.status} = 'pending'`),
          index("admin_mfa_reset_requests_status_created_idx").on(
            table.status,
            table.createdAt.desc(),
          ),
          index("admin_mfa_reset_requests_requester_created_idx").on(
            table.requesterUserId,
            table.createdAt.desc(),
          ),
        ],
      );

const accountRestrictionColumns = {
  userId: text("user_id").primaryKey(),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }).notNull(),
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  reason: text("reason").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const accountRestrictions =
  schemaName === "public"
    ? pgTable("account_restrictions", accountRestrictionColumns)
    : pgSchema(schemaName).table(
        "account_restrictions",
        accountRestrictionColumns,
      );

const adminSessionColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  baseSessionId: text("base_session_id").notNull(),
  mfaDeviceId: uuid("mfa_device_id"),
  tokenHash: text("token_hash").notNull(),
  accessVersion: integer("access_version").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
};

export const adminSessions =
  schemaName === "public"
    ? pgTable("admin_sessions", adminSessionColumns, (table) => [
        uniqueIndex("admin_sessions_token_hash_unique").on(table.tokenHash),
        index("admin_sessions_user_id_idx").on(table.userId),
        index("admin_sessions_base_session_id_idx").on(table.baseSessionId),
        foreignKey({
          columns: [table.mfaDeviceId],
          foreignColumns: [adminMfaDevices.id],
          name: "admin_sessions_mfa_device_fk",
        }).onDelete("set null"),
      ])
    : pgSchema(schemaName).table(
        "admin_sessions",
        adminSessionColumns,
        (table) => [
          uniqueIndex("admin_sessions_token_hash_unique").on(table.tokenHash),
          index("admin_sessions_user_id_idx").on(table.userId),
          index("admin_sessions_base_session_id_idx").on(table.baseSessionId),
          foreignKey({
            columns: [table.mfaDeviceId],
            foreignColumns: [adminMfaDevices.id],
            name: "admin_sessions_mfa_device_fk",
          }).onDelete("set null"),
        ],
      );

const adminActivationTokenColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  purpose: text("purpose")
    .$type<"super_admin" | "product_user" | "delegated_admin">()
    .notNull()
    .default("super_admin"),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
};

export const adminActivationTokens =
  schemaName === "public"
    ? pgTable("admin_activation_tokens", adminActivationTokenColumns, (table) => [
        check(
          "admin_activation_tokens_purpose_check",
          sql`${table.purpose} IN ('super_admin', 'product_user', 'delegated_admin')`,
        ),
        uniqueIndex("admin_activation_tokens_hash_unique").on(table.tokenHash),
        index("admin_activation_tokens_user_id_idx").on(table.userId),
      ])
    : pgSchema(schemaName).table(
        "admin_activation_tokens",
        adminActivationTokenColumns,
        (table) => [
          check(
            "admin_activation_tokens_purpose_check",
            sql`${table.purpose} IN ('super_admin', 'product_user', 'delegated_admin')`,
          ),
          uniqueIndex("admin_activation_tokens_hash_unique").on(table.tokenHash),
          index("admin_activation_tokens_user_id_idx").on(table.userId),
        ],
      );

const instanceSetupStateColumns = {
  slot: integer("slot").primaryKey().default(1),
  state: text("state").$type<InstanceSetupState>().notNull(),
  targetUserId: text("target_user_id"),
  recoveryReason: text("recovery_reason"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const instanceSetupState =
  schemaName === "public"
    ? pgTable("instance_setup_state", instanceSetupStateColumns, (table) => [
        check("instance_setup_state_slot_check", sql`${table.slot} = 1`),
        check(
          "instance_setup_state_value_check",
          sql`${table.state} IN ('pending_initialization', 'pending_admin_recovery', 'completed')`,
        ),
      ])
    : pgSchema(schemaName).table(
        "instance_setup_state",
        instanceSetupStateColumns,
        (table) => [
          check("instance_setup_state_slot_check", sql`${table.slot} = 1`),
          check(
            "instance_setup_state_value_check",
            sql`${table.state} IN ('pending_initialization', 'pending_admin_recovery', 'completed')`,
          ),
        ],
      );

const instanceSetupTokenColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceInstanceId: text("source_instance_id").notNull(),
  generation: uuid("generation").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const instanceSetupTokens =
  schemaName === "public"
    ? pgTable("instance_setup_tokens", instanceSetupTokenColumns, (table) => [
        uniqueIndex("instance_setup_tokens_source_unique").on(
          table.sourceInstanceId,
        ),
        uniqueIndex("instance_setup_tokens_hash_unique").on(table.tokenHash),
        index("instance_setup_tokens_expiry_idx").on(table.expiresAt),
      ])
    : pgSchema(schemaName).table(
        "instance_setup_tokens",
        instanceSetupTokenColumns,
        (table) => [
          uniqueIndex("instance_setup_tokens_source_unique").on(
            table.sourceInstanceId,
          ),
          uniqueIndex("instance_setup_tokens_hash_unique").on(table.tokenHash),
          index("instance_setup_tokens_expiry_idx").on(table.expiresAt),
        ],
      );

const instanceSetupSessionColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull(),
  generation: uuid("generation").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const instanceSetupSessions =
  schemaName === "public"
    ? pgTable("instance_setup_sessions", instanceSetupSessionColumns, (table) => [
        uniqueIndex("instance_setup_sessions_hash_unique").on(table.tokenHash),
        index("instance_setup_sessions_generation_idx").on(table.generation),
        index("instance_setup_sessions_expiry_idx").on(table.expiresAt),
      ])
    : pgSchema(schemaName).table(
        "instance_setup_sessions",
        instanceSetupSessionColumns,
        (table) => [
          uniqueIndex("instance_setup_sessions_hash_unique").on(table.tokenHash),
          index("instance_setup_sessions_generation_idx").on(table.generation),
          index("instance_setup_sessions_expiry_idx").on(table.expiresAt),
        ],
      );

const instanceSetupClaimLimitColumns = {
  sourceHash: text("source_hash").primaryKey(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const instanceSetupClaimLimits =
  schemaName === "public"
    ? pgTable("instance_setup_claim_limits", instanceSetupClaimLimitColumns, (table) => [
        index("instance_setup_claim_limits_expiry_idx").on(table.expiresAt),
      ])
    : pgSchema(schemaName).table(
        "instance_setup_claim_limits",
        instanceSetupClaimLimitColumns,
        (table) => [
          index("instance_setup_claim_limits_expiry_idx").on(table.expiresAt),
        ],
      );

const adminAuditEventColumns = {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  outcome: text("outcome").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  requestId: text("request_id"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const adminAuditEvents =
  schemaName === "public"
    ? pgTable("admin_audit_events", adminAuditEventColumns, (table) => [
        index("admin_audit_events_created_at_idx").on(table.createdAt),
        index("admin_audit_events_actor_created_at_idx").on(
          table.actorUserId,
          table.createdAt,
        ),
      ])
    : pgSchema(schemaName).table(
        "admin_audit_events",
        adminAuditEventColumns,
        (table) => [
          index("admin_audit_events_created_at_idx").on(table.createdAt),
          index("admin_audit_events_actor_created_at_idx").on(
            table.actorUserId,
            table.createdAt,
          ),
        ],
      );

const workerHeartbeatColumns = {
  workerId: text("worker_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  workerType: text("worker_type").notNull(),
  release: text("release"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("running"),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
};

export const workerHeartbeats =
  schemaName === "public"
    ? pgTable("worker_heartbeats", workerHeartbeatColumns, (table) => [
        index("worker_heartbeats_type_seen_idx").on(
          table.workerType,
          table.lastSeenAt,
        ),
        check(
          "worker_heartbeats_status_check",
          sql`${table.status} IN ('running', 'stopped')`,
        ),
      ])
    : pgSchema(schemaName).table(
        "worker_heartbeats",
        workerHeartbeatColumns,
        (table) => [
          index("worker_heartbeats_type_seen_idx").on(
            table.workerType,
            table.lastSeenAt,
          ),
          check(
            "worker_heartbeats_status_check",
            sql`${table.status} IN ('running', 'stopped')`,
          ),
        ],
      );
