import { getDatabaseSchemaName } from "@/db";
import type { PdfExportJobStatus } from "@/db/schema";
import type { QueryResultRow } from "pg";
import {
  createPageResult,
  resolvePage,
  type PageRequest,
  type PageResult,
} from "@/lib/shared/pagination";

import {
  isAdminSystemRoleKey,
  normalizeAdminPermissions,
} from "@/lib/admin/permissions";
import { getDatabasePool } from "@/lib/runtime/database";
import { getApplicationRelease } from "@/lib/runtime/release-metadata";
import { validateRuntimeConfiguration } from "@/lib/runtime/configuration";

export type AdminListRequest = PageRequest & { query?: string };

export interface AdminAssignedRole {
  id: string;
  name: string;
  permissions: ReturnType<typeof normalizeAdminPermissions>;
  systemKey: ReturnType<typeof normalizeSystemRoleKey>;
}

export interface AdminAuditResource {
  description?: string | null;
  id: string;
  label: string;
  type: string;
}

export interface AdminAuditEvent {
  id: string;
  actorUserId: string | null;
  actor: AdminAuditResource | null;
  action: string;
  targetType: string;
  targetId: string | null;
  target: AdminAuditResource;
  outcome: string;
  metadata: Record<string, unknown>;
  resourceLabels: Record<string, AdminAuditResource>;
  requestId: string | null;
  ipHash: string | null;
  createdAt: Date;
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

function normalizeAuditMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function auditResourceKey(type: string, id: string) {
  return `${type}:${id}`;
}

function canonicalAuditResourceType(type: string) {
  if (type === "admin_identity") return "user";
  return type;
}

const auditReferenceFields: Record<string, string> = {
  roleid: "admin_role",
  roleids: "admin_role",
  previousroleids: "admin_role",
  userid: "user",
  userids: "user",
  owneruserid: "user",
  requesteruserid: "user",
  quarantineduserids: "user",
  affecteduserids: "user",
  jobid: "pdf_export",
  jobids: "pdf_export",
  retriedjobid: "pdf_export",
  deviceid: "mfa_device",
  deviceids: "mfa_device",
};

function collectAuditResourceIds(
  metadata: Record<string, unknown>,
  targetType: string,
  targetId: string | null,
) {
  const ids = new Map<string, Set<string>>();
  const add = (type: string, id: string) => {
    const canonicalType = canonicalAuditResourceType(type);
    const current = ids.get(canonicalType) ?? new Set<string>();
    current.add(id);
    ids.set(canonicalType, current);
  };

  if (targetId) add(targetType, targetId);

  function visit(value: unknown, field?: string) {
    if (typeof value === "string" && field) {
      const type = auditReferenceFields[field];
      if (type) add(type, value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, field);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      visit(nested, key.toLowerCase().replaceAll(/[^a-z0-9]/g, ""));
    }
  }

  visit(metadata);
  return ids;
}

function readAuditResourceSnapshots(metadata: Record<string, unknown>) {
  const snapshots: AdminAuditResource[] = [];
  const resources = metadata.resources;
  if (!Array.isArray(resources)) return snapshots;
  for (const value of resources) {
    if (!value || typeof value !== "object") continue;
    const resource = value as Record<string, unknown>;
    if (
      typeof resource.type !== "string" ||
      typeof resource.id !== "string" ||
      typeof resource.label !== "string"
    ) continue;
    snapshots.push({
      type: canonicalAuditResourceType(resource.type),
      id: resource.id,
      label: resource.label,
      description: typeof resource.description === "string"
        ? resource.description
        : null,
    });
  }
  return snapshots;
}

async function resolveAuditResourceLabels(
  rows: Array<{ metadata: unknown; targetId: string | null; targetType: string }>,
) {
  const ids = new Map<string, Set<string>>();
  const resources: Record<string, AdminAuditResource> = {};
  for (const row of rows) {
    const metadata = normalizeAuditMetadata(row.metadata);
    for (const resource of readAuditResourceSnapshots(metadata)) {
      resources[auditResourceKey(resource.type, resource.id)] = resource;
    }
    for (const [type, values] of collectAuditResourceIds(
      metadata,
      row.targetType,
      row.targetId,
    )) {
      const current = ids.get(type) ?? new Set<string>();
      for (const id of values) current.add(id);
      ids.set(type, current);
    }
  }

  const values = (type: string) => [...(ids.get(type) ?? [])];
  if ([...ids.values()].every((entries) => entries.size === 0)) return resources;

  const schema = schemaName();
  const result = await getDatabasePool().query<AdminAuditResource>(
    `SELECT 'user'::text AS type, id::text, name AS label,
        email AS description FROM "user" WHERE id = ANY($1::text[])
     UNION ALL
     SELECT 'admin_role', id::text, name, description
       FROM ${schema}.admin_roles WHERE id::text = ANY($2::text[])
     UNION ALL
     SELECT 'resume', id::text, name, slug
       FROM ${schema}.resumes WHERE id = ANY($3::text[])
     UNION ALL
     SELECT 'pdf_export', id::text, filename, status
       FROM ${schema}.pdf_export_jobs WHERE id::text = ANY($4::text[])
     UNION ALL
     SELECT 'mfa_device', id::text, name, NULL
       FROM ${schema}.admin_mfa_devices WHERE id::text = ANY($5::text[])
     UNION ALL
     SELECT 'admin_mfa_reset_request', request.id::text, identity.name,
        identity.email
       FROM ${schema}.admin_mfa_reset_requests AS request
       JOIN "user" AS identity ON identity.id = request.requester_user_id
      WHERE request.id::text = ANY($6::text[])
     UNION ALL
     SELECT 'admin_session', session.id::text, identity.name, identity.email
       FROM ${schema}.admin_sessions AS session
       JOIN "user" AS identity ON identity.id = session.user_id
      WHERE session.id::text = ANY($7::text[])`,
    [
      values("user"),
      values("admin_role"),
      values("resume"),
      values("pdf_export"),
      values("mfa_device"),
      values("admin_mfa_reset_request"),
      values("admin_session"),
    ],
  );
  for (const resource of result.rows) {
    resources[auditResourceKey(resource.type, resource.id)] = resource;
  }
  return resources;
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
    [
      "event.action",
      "event.target_type",
      "event.target_id",
      "event.outcome",
      "event.actor_user_id",
      "actor.name",
      "actor.email",
    ],
    normalizeSearchQuery(request.query),
  );

  const result = await runPagedQuery<{
    id: string;
    actorUserId: string | null;
    actorName: string | null;
    actorEmail: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    outcome: string;
    metadata: unknown;
    requestId: string | null;
    ipHash: string | null;
    createdAt: Date;
  }>(
    request,
    `SELECT count(*)::text AS total
       FROM ${schema}.admin_audit_events AS event
       LEFT JOIN "user" AS actor ON actor.id = event.actor_user_id
       ${search.clause}`,
    `SELECT event.id::text, event.actor_user_id AS "actorUserId",
      actor.name AS "actorName", actor.email AS "actorEmail", event.action,
      event.target_type AS "targetType", event.target_id AS "targetId",
      event.outcome, event.metadata, event.request_id AS "requestId",
      event.ip_hash AS "ipHash", event.created_at AS "createdAt"
    FROM ${schema}.admin_audit_events AS event
    LEFT JOIN "user" AS actor ON actor.id = event.actor_user_id
    ${search.clause}
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`,
    search.values,
  );

  const resourceLabels = await resolveAuditResourceLabels(result.items);
  return {
    ...result,
    items: result.items.map((row): AdminAuditEvent => {
      const metadata = normalizeAuditMetadata(row.metadata);
      const canonicalTargetType = canonicalAuditResourceType(row.targetType);
      const currentTarget = row.targetId
        ? resourceLabels[auditResourceKey(canonicalTargetType, row.targetId)]
        : undefined;
      const targetSnapshot = metadata.targetSnapshot &&
        typeof metadata.targetSnapshot === "object" &&
        !Array.isArray(metadata.targetSnapshot)
        ? metadata.targetSnapshot as Record<string, unknown>
        : {};
      const target: AdminAuditResource = {
        type: row.targetType,
        id: row.targetId ?? "",
        label: typeof targetSnapshot.label === "string"
          ? targetSnapshot.label
          : currentTarget?.label ?? row.targetId ?? row.targetType,
        description: typeof targetSnapshot.description === "string"
          ? targetSnapshot.description
          : currentTarget?.description ?? null,
      };

      return {
        id: row.id,
        actorUserId: row.actorUserId,
        actor: row.actorUserId ? {
          type: "user",
          id: row.actorUserId,
          label: row.actorName ?? row.actorUserId,
          description: row.actorEmail,
        } : null,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        target,
        outcome: row.outcome,
        metadata,
        resourceLabels,
        requestId: row.requestId,
        ipHash: row.ipHash,
        createdAt: row.createdAt,
      };
    }),
  };
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
    release: getApplicationRelease(),
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
