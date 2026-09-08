import { getDatabaseSchemaName } from "@/db";

import { normalizeAdminPermissions } from "./admin-permissions";
import { getDatabasePool } from "./database";
import { validateRuntimeConfiguration } from "./runtime-configuration";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function schemaName() {
  return quoteIdentifier(getDatabaseSchemaName());
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

export async function listAdminUsers() {
  const schema = schemaName();
  const result = await getDatabasePool().query<{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    resumes: string;
    principalKind: string | null;
    roleName: string | null;
    suspended: boolean;
  }>(`SELECT identity.id, identity.name, identity.email,
      identity."emailVerified", identity."createdAt",
      count(resume.id)::text AS resumes,
      principal.kind AS "principalKind", role.name AS "roleName",
      (restriction.user_id IS NOT NULL AND
       (restriction.suspended_until IS NULL OR restriction.suspended_until > now())) AS suspended
    FROM "user" AS identity
    LEFT JOIN ${schema}.resumes AS resume ON resume.user_id = identity.id
    LEFT JOIN ${schema}.admin_principals AS principal
      ON principal.user_id = identity.id AND principal.quarantined_at IS NULL
    LEFT JOIN ${schema}.admin_assignments AS assignment
      ON assignment.user_id = identity.id
    LEFT JOIN ${schema}.admin_roles AS role ON role.id = assignment.role_id
    LEFT JOIN ${schema}.account_restrictions AS restriction
      ON restriction.user_id = identity.id
    GROUP BY identity.id, principal.kind, role.name, restriction.user_id,
      restriction.suspended_until
    ORDER BY identity."createdAt" DESC
    LIMIT 200`);
  return result.rows.map((row) => ({ ...row, resumes: Number(row.resumes) }));
}

export async function listAdminResumeMetadata() {
  const schema = schemaName();
  const result = await getDatabasePool().query<{
    id: string;
    userId: string;
    name: string;
    summary: string;
    published: boolean;
    slug: string | null;
    updatedAt: Date;
    ownerEmail: string;
  }>(`SELECT resume.id, resume.user_id AS "userId", resume.name,
      coalesce(resume.custom_summary, resume.summary) AS summary,
      resume.published, resume.slug, resume.updated_at AS "updatedAt",
      identity.email AS "ownerEmail"
    FROM ${schema}.resumes AS resume
    JOIN "user" AS identity ON identity.id = resume.user_id
    ORDER BY resume.updated_at DESC
    LIMIT 200`);
  return result.rows;
}

export async function listAdminExports() {
  const schema = schemaName();
  const result = await getDatabasePool().query<{
    id: string;
    filename: string;
    status: string;
    attempts: number;
    requesterEmail: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }>(`SELECT job.id::text, job.filename, job.status, job.attempts,
      identity.email AS "requesterEmail", job.created_at AS "createdAt",
      job.completed_at AS "completedAt"
    FROM ${schema}.pdf_export_jobs AS job
    LEFT JOIN "user" AS identity ON identity.id = job.requester_user_id
    ORDER BY job.created_at DESC
    LIMIT 200`);
  return result.rows;
}

export async function listAdminRoles() {
  const schema = schemaName();
  const result = await getDatabasePool().query<{
    id: string;
    name: string;
    description: string;
    permissions: unknown;
    members: string;
    updatedAt: Date;
  }>(`SELECT role.id::text, role.name, role.description, role.permissions,
      count(assignment.user_id)::text AS members,
      role.updated_at AS "updatedAt"
    FROM ${schema}.admin_roles AS role
    LEFT JOIN ${schema}.admin_assignments AS assignment
      ON assignment.role_id = role.id
    GROUP BY role.id
    ORDER BY lower(role.name) ASC`);
  return result.rows.map((row) => ({
    ...row,
    permissions: normalizeAdminPermissions(row.permissions),
    members: Number(row.members),
  }));
}

export async function listAdminAuditEvents() {
  const schema = schemaName();
  const result = await getDatabasePool().query<{
    id: string;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    outcome: string;
    createdAt: Date;
  }>(`SELECT id::text, actor_user_id AS "actorUserId", action,
      target_type AS "targetType", target_id AS "targetId", outcome,
      created_at AS "createdAt"
    FROM ${schema}.admin_audit_events
    ORDER BY created_at DESC
    LIMIT 300`);
  return result.rows;
}

export async function getAdminSystemStatus() {
  const schema = schemaName();
  const [database, workers] = await Promise.all([
    getDatabasePool().query<{ database: string; serverTime: Date }>(
      `SELECT current_database() AS database, now() AS "serverTime"`,
    ),
    getDatabasePool().query<{
      workerId: string;
      workerType: string;
      release: string | null;
      lastSeenAt: Date;
    }>(`SELECT worker_id AS "workerId", worker_type AS "workerType",
        release, last_seen_at AS "lastSeenAt"
      FROM ${schema}.worker_heartbeats ORDER BY last_seen_at DESC`),
  ]);
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
    workers: workers.rows,
  };
}
