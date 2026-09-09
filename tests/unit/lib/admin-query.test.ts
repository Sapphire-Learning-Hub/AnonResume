import { randomUUID } from "node:crypto";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  listAdminAdministrators,
  listAdminAuditEvents,
  listAdminExports,
  listAdminResumeMetadata,
  listAdminRoles,
  listAdminUsers,
  listAdminWorkers,
  listAssignableAdminUsers,
} from "@/lib/admin-query";
import { getDatabasePool } from "@/lib/database";
import { getDatabaseSchemaName } from "@/db";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("admin paginated queries", () => {
  const marker = `page-${randomUUID()}`;
  const schema = quoteIdentifier(getDatabaseSchemaName());
  const userIds = Array.from({ length: 3 }, (_, index) => `${marker}-user-${index}`);
  const roleIds: string[] = [];

  beforeAll(async () => {
    const pool = getDatabasePool();
    for (const [index, userId] of userIds.entries()) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, $4, $4)`,
        [
          userId,
          `${marker} User ${index}`,
          `${marker}-${index}@example.com`,
          new Date(Date.UTC(2026, 0, index + 1)),
        ],
      );
      await pool.query(
        `INSERT INTO ${schema}.resumes
          (id, user_id, name, summary, document, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [
          `${marker}-resume-${index}`,
          userId,
          `${marker} Resume ${index}`,
          `${marker} Summary`,
          createDefaultResumeDocument(),
          new Date(Date.UTC(2026, 1, index + 1)),
        ],
      );
    }
    const role = await pool.query<{ id: string }>(
      `INSERT INTO ${schema}.admin_roles
        (name, description, permissions, created_by_user_id)
       VALUES ($1, 'Pagination role', '["users.read"]'::jsonb, $2)
       RETURNING id::text`,
      [`${marker} Role`, userIds[0]],
    );
    roleIds.push(role.rows[0]!.id);
    const secondRole = await pool.query<{ id: string }>(
      `INSERT INTO ${schema}.admin_roles
        (name, description, permissions, created_by_user_id)
       VALUES ($1, 'Second pagination role', '["audit.read"]'::jsonb, $2)
       RETURNING id::text`,
      [`${marker} Second role`, userIds[0]],
    );
    roleIds.push(secondRole.rows[0]!.id);
    await pool.query(
      `INSERT INTO ${schema}.admin_principals (user_id, kind)
       VALUES ($1, 'delegated_admin')`,
      [userIds[0]],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_assignments
        (user_id, role_id, assigned_by_user_id)
       VALUES ($1, $2, $1), ($1, $3, $1)`,
      [userIds[0], roleIds[0], roleIds[1]],
    );
    await pool.query(
      `INSERT INTO ${schema}.pdf_export_jobs
        (resume_user_id, resume_id, requester_user_id, access_token_hash, document, filename)
       VALUES ($1, $2, $1, 'pagination-token', $3, $4)`,
      [userIds[0], `${marker}-resume-0`, createDefaultResumeDocument(), `${marker}.pdf`],
    );
    await pool.query(
      `INSERT INTO ${schema}.admin_audit_events
        (actor_user_id, action, target_type, target_id, outcome, metadata)
       VALUES ($1, $2, 'pagination', $3, 'success', '{}'::jsonb)`,
      [userIds[0], `${marker}.action`, marker],
    );
    await pool.query(
      `INSERT INTO ${schema}.worker_heartbeats
        (worker_id, worker_type, release, started_at, last_seen_at, metadata)
       VALUES ($1, 'pdf', 'test', now(), now(), '{}'::jsonb)`,
      [`${marker}-worker`],
    );
  });

  afterAll(async () => {
    const pool = getDatabasePool();
    await pool.query(`DELETE FROM ${schema}.worker_heartbeats WHERE worker_id LIKE $1`, [`${marker}%`]);
    await pool.query(`DELETE FROM ${schema}.admin_audit_events WHERE target_id = $1`, [marker]);
    await pool.query(`DELETE FROM ${schema}.pdf_export_jobs WHERE filename = $1`, [`${marker}.pdf`]);
    await pool.query(
      `DELETE FROM ${schema}.admin_assignments WHERE role_id = ANY($1::uuid[])`,
      [roleIds],
    );
    await pool.query(`DELETE FROM ${schema}.admin_principals WHERE user_id = ANY($1::text[])`, [userIds]);
    await pool.query(
      `DELETE FROM ${schema}.admin_roles WHERE id = ANY($1::uuid[])`,
      [roleIds],
    );
    await pool.query(`DELETE FROM ${schema}.resumes WHERE user_id = ANY($1::text[])`, [userIds]);
    await pool.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [userIds]);
  });

  it("paginates users after applying full-dataset search", async () => {
    const result = await listAdminUsers({
      page: 2,
      pageSize: 2,
      query: marker,
    });

    expect(result).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.roles).toHaveLength(2);
  });

  it("returns pagination metadata for every management list", async () => {
    const request = { page: 1, pageSize: 20, query: marker };
    const [resumes, exports, roles, administrators, events, workers, assignableUsers] = await Promise.all([
      listAdminResumeMetadata(request),
      listAdminExports(request),
      listAdminRoles(request),
      listAdminAdministrators(request),
      listAdminAuditEvents(request),
      listAdminWorkers(request),
      listAssignableAdminUsers(request),
    ]);

    expect(resumes).toMatchObject({ page: 1, pageSize: 20, total: 3, totalPages: 1 });
    expect(resumes.items).toHaveLength(3);
    expect(roles).toMatchObject({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
    expect(roles.items).toHaveLength(2);
    expect(administrators).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(administrators.items[0]?.roles).toHaveLength(2);
    for (const result of [exports, events, workers]) {
      expect(result).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(result.items).toHaveLength(1);
    }
    expect(assignableUsers).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });
});
