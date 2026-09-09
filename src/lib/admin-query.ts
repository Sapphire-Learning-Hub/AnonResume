import { getDatabaseSchemaName } from "@/db";
import type { PdfExportJobStatus } from "@/db/schema";
import type { QueryResultRow } from "pg";
import {
  createPageResult,
  resolvePage,
  type PageRequest,
  type PageResult,
} from "@/lib/pagination";

import {
  isAdminSystemRoleKey,
  normalizeAdminPermissions,
} from "./admin-permissions";
import { getDatabasePool } from "./database";
import { validateRuntimeConfiguration } from "./runtime-configuration";

export type AdminListRequest = PageRequest & { query?: string };

export interface AdminAssignedRole {
  id: string;
  name: string;
  permissions: ReturnType<typeof normalizeAdminPermissions>;
  systemKey: ReturnType<typeof normalizeSystemRoleKey>;
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function schemaName() {
  return quoteIdentifier(getDatabaseSchemaName());
}

function normalizeSystemRoleKey(value: unknown) {
  return isAdminSystemRoleKey(value) ? value : null;
}

function normalizeAssignedRoles(value: unknown): AdminAssignedRole[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const role = item as Record<string, unknown>;
    if (typeof role.id !== "string" || typeof role.name !== "string") {
      return [];
    }
    return [{
      id: role.id,
      name: role.name,
      permissions: normalizeAdminPermissions(role.permissions),
      systemKey: normalizeSystemRoleKey(role.systemKey),
    }];
  });
}

function normalizeSearchQuery(query?: string) {
  const value = query?.trim().slice(0, 100);
  return value ? `%${value}%` : undefined;
}

async function runPagedQuery<T extends QueryResultRow>(
  request: PageRequest,
  countSql: string,
  dataSql: string,
  values: unknown[] = [],
): Promise<PageResult<T>> {
  const pool = getDatabasePool();
  const countResult = await pool.query<{ total: string }>(countSql, values);
  const total = Number(countResult.rows[0]?.total ?? 0);
  const resolved = resolvePage(total, request);
  const result = await pool.query<T>(dataSql, [
    ...values,
    request.pageSize,
    resolved.offset,
  ]);

  return createPageResult(result.rows, total, request);
}

function searchWhere(columns: string[], pattern: string | undefined) {
  if (!pattern) return { clause: "", values: [] as unknown[] };

  return {
    clause: `WHERE (${columns.map((column) => `${column} ILIKE $1`).join(" OR ")})`,
    values: [pattern] as unknown[],
  };
}

function appendCondition(whereClause: string, condition: string) {
  return whereClause ? `${whereClause} AND ${condition}` : `WHERE ${condition}`;
}

export async function getAdminOverview() {
  const schema = schemaName();
  const result = await getDatabasePool().query<{
    users: string;
    resumes: string;
    published: string;
    queued: string;
    failed: string;
  }>(`SELECT
      (SELECT count(*) FROM "user")::text AS users,
      (SELECT count(*) FROM ${schema}.resumes)::text AS resumes,
      (SELECT count(*) FROM ${schema}.resumes WHERE published)::text AS published,
      (SELECT count(*) FROM ${schema}.pdf_export_jobs WHERE status IN ('queued', 'running'))::text AS queued,
      (SELECT count(*) FROM ${schema}.pdf_export_jobs WHERE status = 'failed')::text AS failed`);
  const row = result.rows[0]!;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  ) as Record<keyof typeof row, number>;
}

export async function listAdminUsers(request: AdminListRequest) {
  const schema = schemaName();
  const search = searchWhere(
    ["identity.name", "identity.email"],
    normalizeSearchQuery(request.query),
  );

  const result = await runPagedQuery<{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    resumes: number;
    principalKind: string | null;
    roles: unknown;
    suspended: boolean;
  }>(
    request,
    `SELECT count(*)::text AS total FROM "user" AS identity ${search.clause}`,
    `SELECT identity.id, identity.name, identity.email,
      identity."emailVerified", identity."createdAt",
      (SELECT count(*)::int FROM ${schema}.resumes AS resume
        WHERE resume.user_id = identity.id) AS resumes,
      principal.kind AS "principalKind",
      coalesce(assigned_roles.roles, '[]'::jsonb) AS roles,
      (restriction.user_id IS NOT NULL AND
       (restriction.suspended_until IS NULL OR restriction.suspended_until > now())) AS suspended
    FROM "user" AS identity
    LEFT JOIN ${schema}.admin_principals AS principal
      ON principal.user_id = identity.id AND principal.quarantined_at IS NULL
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', role.id::text,
          'name', role.name,
          'permissions', role.permissions,
          'systemKey', role.system_key
        ) ORDER BY lower(role.name), role.id
      ) AS roles
      FROM ${schema}.admin_assignments AS assignment
      JOIN ${schema}.admin_roles AS role ON role.id = assignment.role_id
      WHERE assignment.user_id = identity.id
    ) AS assigned_roles ON true
    LEFT JOIN ${schema}.account_restrictions AS restriction
      ON restriction.user_id = identity.id
    ${search.clause}
    ORDER BY identity."createdAt" DESC, identity.id DESC
    LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`,
    search.values,
  );

  return {
    ...result,
    items: result.items.map((row) => ({
      ...row,
      roles: normalizeAssignedRoles(row.roles),
    })),
  };
}

export async function listAssignableAdminUsers(request: AdminListRequest) {
  const schema = schemaName();
  const search = searchWhere(
    ["identity.name", "identity.email"],
    normalizeSearchQuery(request.query),
  );
  const where = appendCondition(
    search.clause,
    "principal.user_id IS NULL",
  );

  return runPagedQuery<{
    id: string;
    name: string;
    email: string;
  }>(
    request,
    `SELECT count(*)::text AS total
       FROM "user" AS identity
       LEFT JOIN ${schema}.admin_principals AS principal
         ON principal.user_id = identity.id AND principal.quarantined_at IS NULL
       ${where}`,
    `SELECT identity.id, identity.name, identity.email
       FROM "user" AS identity
       LEFT JOIN ${schema}.admin_principals AS principal
         ON principal.user_id = identity.id AND principal.quarantined_at IS NULL
       ${where}
       ORDER BY lower(identity.name) ASC, identity.id ASC
       LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`,
    search.values,
  );
}

export async function listAdminResumeMetadata(request: AdminListRequest) {
  const schema = schemaName();
  const search = searchWhere(
    ["resume.name", "resume.summary", "resume.custom_summary", "identity.email"],
    normalizeSearchQuery(request.query),
  );

  return runPagedQuery<{
    id: string;
    userId: string;
    name: string;
    summary: string;
    published: boolean;
    slug: string | null;
    updatedAt: Date;
    ownerEmail: string;
  }>(
    request,
    `SELECT count(*)::text AS total
       FROM ${schema}.resumes AS resume
       JOIN "user" AS identity ON identity.id = resume.user_id
       ${search.clause}`,
    `SELECT resume.id, resume.user_id AS "userId", resume.name,
      coalesce(resume.custom_summary, resume.summary) AS summary,
      resume.published, resume.slug, resume.updated_at AS "updatedAt",
      identity.email AS "ownerEmail"
    FROM ${schema}.resumes AS resume
    JOIN "user" AS identity ON identity.id = resume.user_id
    ${search.clause}
    ORDER BY resume.updated_at DESC, resume.user_id ASC, resume.id ASC
    LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`,
    search.values,
  );
}

export async function listAdminExports(request: AdminListRequest) {
  const schema = schemaName();
  const search = searchWhere(
    ["job.filename", "job.status", "identity.email"],
    normalizeSearchQuery(request.query),
  );

  return runPagedQuery<{
    id: string;
    filename: string;
    status: PdfExportJobStatus;
    attempts: number;
    requesterEmail: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }>(
    request,
    `SELECT count(*)::text AS total
       FROM ${schema}.pdf_export_jobs AS job
       LEFT JOIN "user" AS identity ON identity.id = job.requester_user_id
       ${search.clause}`,
    `SELECT job.id::text, job.filename, job.status, job.attempts,
      identity.email AS "requesterEmail", job.created_at AS "createdAt",
      job.completed_at AS "completedAt"
    FROM ${schema}.pdf_export_jobs AS job
    LEFT JOIN "user" AS identity ON identity.id = job.requester_user_id
    ${search.clause}
    ORDER BY job.created_at DESC, job.id DESC
    LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`,
    search.values,
  );
}

export async function listAdminRoles(request: AdminListRequest) {
  const schema = schemaName();
  const search = searchWhere(
    ["role.name", "role.description"],
    normalizeSearchQuery(request.query),
  );
  const result = await runPagedQuery<{
    id: string;
    name: string;
    description: string;
    permissions: unknown;
    systemKey: string | null;
    members: number;
    updatedAt: Date;
  }>(
    request,
    `SELECT count(*)::text AS total FROM ${schema}.admin_roles AS role ${search.clause}`,
    `SELECT role.id::text, role.name, role.description, role.permissions,
      role.system_key AS "systemKey",
      count(assignment.user_id)::int AS members,
      role.updated_at AS "updatedAt"
    FROM ${schema}.admin_roles AS role
    LEFT JOIN ${schema}.admin_assignments AS assignment
      ON assignment.role_id = role.id
    ${search.clause}
    GROUP BY role.id
    ORDER BY CASE role.system_key
      WHEN 'read_only_auditor' THEN 0
      WHEN 'support_operator' THEN 1
      WHEN 'content_reviewer' THEN 2
      WHEN 'system_operator' THEN 3
      ELSE 4 END ASC,
      lower(role.name) ASC, role.id ASC
    LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`,
    search.values,
  );

  return {
    ...result,
    items: result.items.map((row) => ({
      ...row,
      permissions: normalizeAdminPermissions(row.permissions),
      systemKey: isAdminSystemRoleKey(row.systemKey) ? row.systemKey : null,
    })),
  };
}

export async function listAdminAdministrators(request: AdminListRequest) {
  const schema = schemaName();
  const pattern = normalizeSearchQuery(request.query);
  const searchClause = pattern
    ? `WHERE (identity.name ILIKE $1 OR identity.email ILIKE $1 OR EXISTS (
        SELECT 1
          FROM ${schema}.admin_assignments AS searched_assignment
          JOIN ${schema}.admin_roles AS searched_role
            ON searched_role.id = searched_assignment.role_id
         WHERE searched_assignment.user_id = identity.id
           AND searched_role.name ILIKE $1
      ))`
    : "";
  const values = pattern ? [pattern] : [];
  const where = appendCondition(searchClause, "principal.kind = 'delegated_admin'");

  const result = await runPagedQuery<{
    id: string;
    name: string;
    email: string;
    principalKind: string;
    roles: unknown;
  }>(
    request,
    `SELECT count(*)::text AS total
       FROM ${schema}.admin_principals AS principal
       JOIN "user" AS identity ON identity.id = principal.user_id
       ${where}`,
    `SELECT identity.id, identity.name, identity.email,
      principal.kind AS "principalKind",
      coalesce(assigned_roles.roles, '[]'::jsonb) AS roles
    FROM ${schema}.admin_principals AS principal
    JOIN "user" AS identity ON identity.id = principal.user_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', role.id::text,
          'name', role.name,
          'permissions', role.permissions,
          'systemKey', role.system_key
        ) ORDER BY lower(role.name), role.id
      ) AS roles
      FROM ${schema}.admin_assignments AS assignment
      JOIN ${schema}.admin_roles AS role ON role.id = assignment.role_id
      WHERE assignment.user_id = identity.id
    ) AS assigned_roles ON true
    ${where}
    ORDER BY identity."createdAt" DESC, identity.id DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    values,
  );

  return {
    ...result,
    items: result.items.map((row) => ({
      ...row,
      roles: normalizeAssignedRoles(row.roles),
    })),
  };
}

export async function listAdminAuditEvents(request: AdminListRequest) {
  const schema = schemaName();
  const search = searchWhere(
    ["action", "target_type", "target_id", "outcome", "actor_user_id"],
    normalizeSearchQuery(request.query),
  );

  return runPagedQuery<{
    id: string;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    outcome: string;
    createdAt: Date;
  }>(
    request,
    `SELECT count(*)::text AS total FROM ${schema}.admin_audit_events ${search.clause}`,
    `SELECT id::text, actor_user_id AS "actorUserId", action,
      target_type AS "targetType", target_id AS "targetId", outcome,
      created_at AS "createdAt"
    FROM ${schema}.admin_audit_events
    ${search.clause}
    ORDER BY created_at DESC, id DESC
    LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`,
    search.values,
  );
}

export async function listAdminWorkers(request: AdminListRequest) {
  const schema = schemaName();
  const search = searchWhere(
    ["worker_id", "worker_type", "release"],
    normalizeSearchQuery(request.query),
  );

  return runPagedQuery<{
    workerId: string;
    workerType: string;
    release: string | null;
    lastSeenAt: Date;
  }>(
    request,
    `SELECT count(*)::text AS total FROM ${schema}.worker_heartbeats ${search.clause}`,
    `SELECT worker_id AS "workerId", worker_type AS "workerType",
      release, last_seen_at AS "lastSeenAt"
    FROM ${schema}.worker_heartbeats
    ${search.clause}
    ORDER BY last_seen_at DESC, worker_id ASC
    LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`,
    search.values,
  );
}

export async function getAdminSystemStatus() {
  const database = await getDatabasePool().query<{
    database: string;
    serverTime: Date;
  }>(`SELECT current_database() AS database, now() AS "serverTime"`);
  const configuration = validateRuntimeConfiguration(process.env);
  return {
    release: process.env.ANONRESUME_RELEASE || "development",
    database: database.rows[0],
    configurationValid: configuration.valid,
    configurationIssues: configuration.issues,
    smtpConfigured: Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD,
    ),
    queue: {
      maxConcurrency: Number(process.env.PDF_EXPORT_MAX_CONCURRENCY || 2),
      queueLimit: Number(process.env.PDF_EXPORT_QUEUE_LIMIT || 100),
    },
  };
}
