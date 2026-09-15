import type { AdminMfaResetRequestStatus } from "@/db/schema";
import { getDatabaseSchemaName } from "@/db";
import type { PageRequest, PageResult } from "@/lib/shared/pagination";
import { createPageResult, resolvePage } from "@/lib/shared/pagination";

import {
  createAdminAuditChanges,
  writeAdminAuditEventWithClient,
} from "@/lib/admin/audit";
import { getDatabasePool } from "@/lib/runtime/database";

const REQUEST_TTL_MS = 72 * 60 * 60 * 1000;

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function schemaName() {
  return quoteIdentifier(getDatabaseSchemaName());
}

export class AdminMfaResetRequestForbiddenError extends Error {
  constructor() {
    super("Only delegated administrators can request MFA reset approval");
    this.name = "AdminMfaResetRequestForbiddenError";
  }
}

export class AdminMfaResetRequestConflictError extends Error {
  constructor(message = "The MFA reset request cannot be changed") {
    super(message);
    this.name = "AdminMfaResetRequestConflictError";
  }
}

export class AdminMfaResetRequestNotFoundError extends Error {
  constructor() {
    super("MFA reset request not found");
    this.name = "AdminMfaResetRequestNotFoundError";
  }
}

export interface AdminMfaResetRequest {
  id: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string;
  reason: string;
  status: AdminMfaResetRequestStatus;
  reviewerUserId: string | null;
  reviewReason: string | null;
  expiresAt: Date;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RequestRow {
  id: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string;
  reason: string;
  status: AdminMfaResetRequestStatus;
  reviewerUserId: string | null;
  reviewReason: string | null;
  expiresAt: Date;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const requestSelection = `request.id,
  request.requester_user_id AS "requesterUserId",
  identity.name AS "requesterName",
  identity.email AS "requesterEmail",
  request.reason,
  request.status,
  request.reviewer_user_id AS "reviewerUserId",
  request.review_reason AS "reviewReason",
  request.expires_at AS "expiresAt",
  request.reviewed_at AS "reviewedAt",
  request.created_at AS "createdAt",
  request.updated_at AS "updatedAt"`;

async function expirePendingRequests(now: Date, userId?: string) {
  const schema = schemaName();
  await getDatabasePool().query(
    `UPDATE ${schema}.admin_mfa_reset_requests
        SET status = 'expired', updated_at = $1
      WHERE status = 'pending' AND expires_at <= $1
        AND ($2::text IS NULL OR requester_user_id = $2)`,
    [now, userId ?? null],
  );
}

export async function submitAdminMfaResetRequest({
  userId,
  reason,
  now = new Date(),
}: {
  userId: string;
  reason: string;
  now?: Date;
}) {
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 10 || normalizedReason.length > 1000) {
    throw new AdminMfaResetRequestConflictError(
      "The request reason must contain 10 to 1000 characters",
    );
  }

  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const access = await client.query<{
      kind: string;
      assigned: boolean;
      hasVerifiedDevice: boolean;
      suspended: boolean;
      requesterEmail: string;
      requesterName: string;
    }>(
      `SELECT principal.kind,
          identity.email AS "requesterEmail",
          identity.name AS "requesterName",
          EXISTS (
            SELECT 1 FROM ${schema}.admin_assignments AS assignment
             WHERE assignment.user_id = principal.user_id
          ) AS assigned,
          EXISTS (
            SELECT 1 FROM ${schema}.admin_mfa_devices AS device
             WHERE device.user_id = principal.user_id
               AND device.verified_at IS NOT NULL
          ) AS "hasVerifiedDevice",
          EXISTS (
            SELECT 1 FROM ${schema}.account_restrictions AS restriction
             WHERE restriction.user_id = principal.user_id
               AND (restriction.suspended_until IS NULL OR restriction.suspended_until > $2)
          ) AS suspended
         FROM ${schema}.admin_principals AS principal
         JOIN "user" AS identity ON identity.id = principal.user_id
        WHERE principal.user_id = $1 AND principal.quarantined_at IS NULL
        FOR UPDATE OF principal`,
      [userId, now],
    );
    const principal = access.rows[0];
    if (
      principal?.kind !== "delegated_admin" ||
      !principal.assigned ||
      principal.suspended
    ) {
      throw new AdminMfaResetRequestForbiddenError();
    }
    if (!principal.hasVerifiedDevice) {
      throw new AdminMfaResetRequestConflictError(
        "No verified MFA device needs approval-based reset",
      );
    }

    await client.query(
      `UPDATE ${schema}.admin_mfa_reset_requests
          SET status = 'expired', updated_at = $2
        WHERE requester_user_id = $1 AND status = 'pending' AND expires_at <= $2`,
      [userId, now],
    );
    const expiresAt = new Date(now.getTime() + REQUEST_TTL_MS);
    let inserted;
    try {
      inserted = await client.query<RequestRow>(
        `INSERT INTO ${schema}.admin_mfa_reset_requests
          (requester_user_id, reason, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         RETURNING id, requester_user_id AS "requesterUserId",
           $5::text AS "requesterName", $6::text AS "requesterEmail", reason,
           status, reviewer_user_id AS "reviewerUserId",
           review_reason AS "reviewReason", expires_at AS "expiresAt",
           reviewed_at AS "reviewedAt", created_at AS "createdAt",
           updated_at AS "updatedAt"`,
        [
          userId,
          normalizedReason,
          expiresAt,
          now,
          principal.requesterName,
          principal.requesterEmail,
        ],
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new AdminMfaResetRequestConflictError(
          "A pending MFA reset request already exists",
        );
      }
      throw error;
    }
    await writeAdminAuditEventWithClient(client, {
      actorUserId: userId,
      action: "administrator.mfa_reset.request",
      targetType: "admin_mfa_reset_request",
      targetId: inserted.rows[0]!.id,
      outcome: "success",
      metadata: {
        changes: createAdminAuditChanges(
          { status: null },
          { status: "pending" },
        ),
        expiresAt,
        reason: normalizedReason,
        requesterUserId: userId,
        targetSnapshot: {
          label: principal.requesterName,
          description: principal.requesterEmail,
        },
      },
    });
    await client.query("COMMIT");
    return inserted.rows[0]!;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getAdminMfaResetRequestForUser(
  userId: string,
  now = new Date(),
) {
  await expirePendingRequests(now, userId);
  const schema = schemaName();
  const result = await getDatabasePool().query<
    RequestRow & { hasVerifiedDevice: boolean }
  >(
    `SELECT ${requestSelection},
        EXISTS (
          SELECT 1 FROM ${schema}.admin_mfa_devices AS device
           WHERE device.user_id = request.requester_user_id
             AND device.verified_at IS NOT NULL
        ) AS "hasVerifiedDevice"
       FROM ${schema}.admin_mfa_reset_requests AS request
       JOIN "user" AS identity ON identity.id = request.requester_user_id
      WHERE request.requester_user_id = $1
      ORDER BY request.created_at DESC, request.id DESC
      LIMIT 1`,
    [userId],
  );
  const current = result.rows[0];
  if (!current) return null;

  const { hasVerifiedDevice, ...request } = current;
  return request.status === "approved" && hasVerifiedDevice ? null : request;
}

export async function cancelAdminMfaResetRequest({
  requestId,
  userId,
  now = new Date(),
}: {
  requestId: string;
  userId: string;
  now?: Date;
}) {
  await expirePendingRequests(now, userId);
  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const request = await client.query<{
      expiresAt: Date;
      requesterEmail: string;
      requesterName: string;
      status: string;
    }>(
      `SELECT request.expires_at AS "expiresAt", request.status,
          identity.name AS "requesterName", identity.email AS "requesterEmail"
         FROM ${schema}.admin_mfa_reset_requests AS request
         JOIN "user" AS identity ON identity.id = request.requester_user_id
        WHERE request.id = $1 AND request.requester_user_id = $2
        FOR UPDATE OF request`,
      [requestId, userId],
    );
    const current = request.rows[0];
    if (!current) throw new AdminMfaResetRequestNotFoundError();
    if (current.status !== "pending" || current.expiresAt <= now) {
      throw new AdminMfaResetRequestConflictError();
    }
    await client.query(
      `UPDATE ${schema}.admin_mfa_reset_requests
          SET status = 'cancelled', updated_at = $2 WHERE id = $1`,
      [requestId, now],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId: userId,
      action: "administrator.mfa_reset.cancel",
      targetType: "admin_mfa_reset_request",
      targetId: requestId,
      outcome: "success",
      metadata: {
        changes: createAdminAuditChanges(
          { status: current.status },
          { status: "cancelled" },
        ),
        targetSnapshot: {
          label: current.requesterName,
          description: current.requesterEmail,
        },
      },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function reviewAdminMfaResetRequest({
  actorUserId,
  requestId,
  decision,
  reason,
  now = new Date(),
}: {
  actorUserId: string;
  requestId: string;
  decision: "approved" | "rejected";
  reason?: string;
  now?: Date;
}) {
  const normalizedReason = reason?.trim() || null;
  if (decision === "rejected" && !normalizedReason) {
    throw new AdminMfaResetRequestConflictError(
      "A rejection reason is required",
    );
  }

  await expirePendingRequests(now);

  const schema = schemaName();
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const actor = await client.query<{ kind: string }>(
      `SELECT kind FROM ${schema}.admin_principals
        WHERE user_id = $1 AND quarantined_at IS NULL FOR UPDATE`,
      [actorUserId],
    );
    if (actor.rows[0]?.kind !== "super_admin") {
      throw new AdminMfaResetRequestForbiddenError();
    }
    const request = await client.query<{
      requesterUserId: string;
      requesterEmail: string;
      requesterName: string;
      expiresAt: Date;
      status: AdminMfaResetRequestStatus;
    }>(
      `SELECT requester_user_id AS "requesterUserId",
          identity.email AS "requesterEmail",
          identity.name AS "requesterName",
          expires_at AS "expiresAt", status
         FROM ${schema}.admin_mfa_reset_requests AS request
         JOIN "user" AS identity ON identity.id = request.requester_user_id
        WHERE request.id = $1 FOR UPDATE OF request`,
      [requestId],
    );
    const current = request.rows[0];
    if (!current) throw new AdminMfaResetRequestNotFoundError();
    if (current.status !== "pending" || current.expiresAt <= now) {
      throw new AdminMfaResetRequestConflictError();
    }

    if (decision === "approved") {
      const target = await client.query(
        `SELECT 1 FROM ${schema}.admin_principals AS principal
         WHERE principal.user_id = $1 AND principal.kind = 'delegated_admin'
           AND principal.quarantined_at IS NULL
           AND EXISTS (
             SELECT 1 FROM ${schema}.admin_assignments AS assignment
              WHERE assignment.user_id = principal.user_id
           )`,
        [current.requesterUserId],
      );
      if (target.rowCount !== 1) {
        throw new AdminMfaResetRequestConflictError(
          "The requester no longer has delegated management access",
        );
      }
      await client.query(
        `DELETE FROM ${schema}.admin_mfa_devices WHERE user_id = $1`,
        [current.requesterUserId],
      );
      await client.query(
        `DELETE FROM ${schema}.admin_recovery_codes WHERE user_id = $1`,
        [current.requesterUserId],
      );
      await client.query(
        `INSERT INTO ${schema}.admin_security_states
          (user_id, failed_attempts, locked_until, recovery_required, updated_at)
         VALUES ($1, 0, NULL, false, $2)
         ON CONFLICT (user_id) DO UPDATE SET
           failed_attempts = 0, locked_until = NULL,
           recovery_required = false, updated_at = $2`,
        [current.requesterUserId, now],
      );
      await client.query(
        `UPDATE ${schema}.admin_sessions SET revoked_at = $2
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [current.requesterUserId, now],
      );
    }

    const updated = await client.query<RequestRow>(
      `UPDATE ${schema}.admin_mfa_reset_requests AS request
          SET status = $2, reviewer_user_id = $3, review_reason = $4,
              reviewed_at = $5, updated_at = $5
        WHERE request.id = $1
        RETURNING request.id,
          request.requester_user_id AS "requesterUserId",
          $6::text AS "requesterName", $7::text AS "requesterEmail",
          request.reason, request.status,
          request.reviewer_user_id AS "reviewerUserId",
          request.review_reason AS "reviewReason",
          request.expires_at AS "expiresAt",
          request.reviewed_at AS "reviewedAt",
          request.created_at AS "createdAt",
          request.updated_at AS "updatedAt"`,
      [
        requestId,
        decision,
        actorUserId,
        normalizedReason,
        now,
        current.requesterName,
        current.requesterEmail,
      ],
    );
    await writeAdminAuditEventWithClient(client, {
      actorUserId,
      action: `administrator.mfa_reset.${decision}`,
      targetType: "user",
      targetId: current.requesterUserId,
      outcome: "success",
      metadata: {
        changes: createAdminAuditChanges(
          { status: current.status, reviewReason: null },
          { status: decision, reviewReason: normalizedReason },
        ),
        requestId,
        resources: [{
          type: "admin_mfa_reset_request",
          id: requestId,
          label: current.requesterName,
          description: current.requesterEmail,
        }],
        targetSnapshot: {
          label: current.requesterName,
          description: current.requesterEmail,
        },
      },
    });
    await client.query("COMMIT");
    return updated.rows[0]!;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminMfaResetRequests(
  request: PageRequest & { status?: AdminMfaResetRequestStatus },
): Promise<PageResult<AdminMfaResetRequest>> {
  await expirePendingRequests(new Date());
  const schema = schemaName();
  const pool = getDatabasePool();
  const status = request.status ?? null;
  const count = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM ${schema}.admin_mfa_reset_requests
      WHERE ($1::text IS NULL OR status = $1)`,
    [status],
  );
  const total = Number(count.rows[0]?.count ?? 0);
  const page = resolvePage(total, request);
  const rows = await pool.query<RequestRow>(
    `SELECT ${requestSelection}
       FROM ${schema}.admin_mfa_reset_requests AS request
       JOIN "user" AS identity ON identity.id = request.requester_user_id
      WHERE ($1::text IS NULL OR request.status = $1)
      ORDER BY
        CASE WHEN request.status = 'pending' THEN 0 ELSE 1 END,
        request.created_at DESC,
        request.id DESC
      LIMIT $2 OFFSET $3`,
    [status, request.pageSize, page.offset],
  );
  return createPageResult(rows.rows, total, request);
}
