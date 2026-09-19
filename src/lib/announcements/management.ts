import type { PoolClient, QueryResultRow } from "pg";

import { getDatabaseSchemaName } from "@/db";
import type { AppLocale } from "@/i18n/messages";
import {
  createAdminAuditChanges,
  writeAdminAuditEventWithClient,
} from "@/lib/admin/audit";
import type { AdminAuditAction } from "@/lib/admin/audit-catalog";
import {
  AnnouncementStateConflictError,
  assertAnnouncementCanPublish,
  localizeAnnouncement,
  MAX_ACTIVE_ANNOUNCEMENTS,
  selectVisibleAnnouncements,
  type AnnouncementRecord,
  type LocalizedAnnouncement,
} from "@/lib/announcements/rules";
import type { AnnouncementDraftInput } from "@/lib/announcements/validation";
import { getDatabasePool } from "@/lib/runtime/database";
import {
  createPageResult,
  resolvePage,
  type PageRequest,
  type PageResult,
} from "@/lib/shared/pagination";

const ANNOUNCEMENT_PUBLISH_LOCK = "anonresume:announcements:publish";

export interface ManagedAnnouncement extends AnnouncementRecord {
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AnnouncementNotFoundError extends Error {
  constructor() {
    super("Announcement was not found");
    this.name = "AnnouncementNotFoundError";
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function schemaName() {
  return quoteIdentifier(getDatabaseSchemaName());
}

const announcementSelection = `
  id::text,
  title_zh AS "titleZh",
  body_zh AS "bodyZh",
  title_en AS "titleEn",
  body_en AS "bodyEn",
  tone,
  audience,
  dismissible,
  status,
  published_at AS "publishedAt",
  expires_at AS "expiresAt",
  created_by_user_id AS "createdByUserId",
  updated_by_user_id AS "updatedByUserId",
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

function announcementSnapshot(announcement: ManagedAnnouncement) {
  return {
    type: "announcement",
    id: announcement.id,
    label: announcement.titleZh,
    description: announcement.status,
  };
}

function announcementAuditState(announcement: ManagedAnnouncement) {
  return {
    titleZh: announcement.titleZh,
    bodyZh: announcement.bodyZh,
    titleEn: announcement.titleEn,
    bodyEn: announcement.bodyEn,
    tone: announcement.tone,
    audience: announcement.audience,
    dismissible: announcement.dismissible,
    status: announcement.status,
    expiresAt: announcement.expiresAt,
  };
}

async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function findAnnouncementForUpdate(
  client: PoolClient,
  announcementId: string,
) {
  const result = await client.query<ManagedAnnouncement>(
    `SELECT ${announcementSelection}
       FROM ${schemaName()}.announcements
      WHERE id = $1::uuid
      FOR UPDATE`,
    [announcementId],
  );
  const announcement = result.rows[0];
  if (!announcement) throw new AnnouncementNotFoundError();
  return announcement;
}

async function writeAnnouncementAudit(
  client: PoolClient,
  input: {
    actorUserId: string;
    action: AdminAuditAction;
    announcement: ManagedAnnouncement;
    before?: ManagedAnnouncement;
  },
) {
  await writeAdminAuditEventWithClient(client, {
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: "announcement",
    targetId: input.announcement.id,
    outcome: "success",
    metadata: {
      targetSnapshot: announcementSnapshot(input.announcement),
      changes: input.before
        ? createAdminAuditChanges(
            announcementAuditState(input.before),
            announcementAuditState(input.announcement),
          )
        : [],
    },
  });
}

export async function createAnnouncement(input: {
  actorUserId: string;
  draft: AnnouncementDraftInput;
}) {
  return withTransaction(async (client) => {
    const result = await client.query<ManagedAnnouncement>(
      `INSERT INTO ${schemaName()}.announcements
        (title_zh, body_zh, title_en, body_en, tone, audience, dismissible,
         expires_at, created_by_user_id, updated_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING ${announcementSelection}`,
      [
        input.draft.titleZh,
        input.draft.bodyZh,
        input.draft.titleEn,
        input.draft.bodyEn,
        input.draft.tone,
        input.draft.audience,
        input.draft.dismissible,
        input.draft.expiresAt,
        input.actorUserId,
      ],
    );
    const announcement = result.rows[0]!;
    await writeAnnouncementAudit(client, {
      actorUserId: input.actorUserId,
      action: "announcement.create",
      announcement,
    });
    return announcement;
  });
}

export async function updateAnnouncement(input: {
  actorUserId: string;
  announcementId: string;
  draft: AnnouncementDraftInput;
}) {
  return withTransaction(async (client) => {
    const before = await findAnnouncementForUpdate(client, input.announcementId);
    if (before.status === "published") {
      throw new AnnouncementStateConflictError();
    }
    const result = await client.query<ManagedAnnouncement>(
      `UPDATE ${schemaName()}.announcements
          SET title_zh = $2, body_zh = $3, title_en = $4, body_en = $5,
              tone = $6, audience = $7, dismissible = $8, expires_at = $9,
              updated_by_user_id = $10, updated_at = now()
        WHERE id = $1::uuid
        RETURNING ${announcementSelection}`,
      [
        input.announcementId,
        input.draft.titleZh,
        input.draft.bodyZh,
        input.draft.titleEn,
        input.draft.bodyEn,
        input.draft.tone,
        input.draft.audience,
        input.draft.dismissible,
        input.draft.expiresAt,
        input.actorUserId,
      ],
    );
    const announcement = result.rows[0]!;
    await writeAnnouncementAudit(client, {
      actorUserId: input.actorUserId,
      action: "announcement.update",
      announcement,
      before,
    });
    return announcement;
  });
}

export async function publishAnnouncement(input: {
  actorUserId: string;
  announcementId: string;
}) {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      ANNOUNCEMENT_PUBLISH_LOCK,
    ]);
    const before = await findAnnouncementForUpdate(client, input.announcementId);
    const now = new Date();
    const activeResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM ${schemaName()}.announcements
        WHERE status = 'published'
          AND id <> $1::uuid
          AND (expires_at IS NULL OR expires_at > $2)`,
      [input.announcementId, now],
    );
    assertAnnouncementCanPublish(before, {
      activeCount: Number(activeResult.rows[0]?.count ?? 0),
      now,
    });

    const result = await client.query<ManagedAnnouncement>(
      `UPDATE ${schemaName()}.announcements
          SET status = 'published', published_at = $2,
              updated_by_user_id = $3, updated_at = now()
        WHERE id = $1::uuid
        RETURNING ${announcementSelection}`,
      [input.announcementId, now, input.actorUserId],
    );
    const announcement = result.rows[0]!;
    await writeAnnouncementAudit(client, {
      actorUserId: input.actorUserId,
      action: "announcement.publish",
      announcement,
      before,
    });
    return announcement;
  });
}

export async function withdrawAnnouncement(input: {
  actorUserId: string;
  announcementId: string;
}) {
  return withTransaction(async (client) => {
    const before = await findAnnouncementForUpdate(client, input.announcementId);
    if (before.status !== "published") {
      throw new AnnouncementStateConflictError();
    }
    const result = await client.query<ManagedAnnouncement>(
      `UPDATE ${schemaName()}.announcements
          SET status = 'withdrawn', updated_by_user_id = $2, updated_at = now()
        WHERE id = $1::uuid
        RETURNING ${announcementSelection}`,
      [input.announcementId, input.actorUserId],
    );
    const announcement = result.rows[0]!;
    await writeAnnouncementAudit(client, {
      actorUserId: input.actorUserId,
      action: "announcement.withdraw",
      announcement,
      before,
    });
    return announcement;
  });
}

export async function deleteAnnouncementDraft(input: {
  actorUserId: string;
  announcementId: string;
}) {
  await withTransaction(async (client) => {
    const announcement = await findAnnouncementForUpdate(
      client,
      input.announcementId,
    );
    if (announcement.status !== "draft") {
      throw new AnnouncementStateConflictError();
    }
    await client.query(
      `DELETE FROM ${schemaName()}.announcements WHERE id = $1::uuid`,
      [input.announcementId],
    );
    await writeAnnouncementAudit(client, {
      actorUserId: input.actorUserId,
      action: "announcement.delete",
      announcement,
    });
  });
}

export async function listManagedAnnouncements(
  request: PageRequest & { query?: string },
): Promise<PageResult<ManagedAnnouncement>> {
  const pool = getDatabasePool();
  const query = request.query?.trim().slice(0, 100);
  const values = query ? [`%${query}%`] : [];
  const filter = query
    ? "WHERE title_zh ILIKE $1 OR title_en ILIKE $1 OR body_zh ILIKE $1 OR body_en ILIKE $1"
    : "";
  const countResult = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM ${schemaName()}.announcements ${filter}`,
    values,
  );
  const total = Number(countResult.rows[0]?.total ?? 0);
  const resolved = resolvePage(total, request);
  const limitParameter = values.length + 1;
  const offsetParameter = values.length + 2;
  const result = await pool.query<ManagedAnnouncement & QueryResultRow>(
    `SELECT ${announcementSelection}
       FROM ${schemaName()}.announcements
       ${filter}
      ORDER BY created_at DESC, id DESC
      LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
    [...values, request.pageSize, resolved.offset],
  );
  return createPageResult(result.rows, total, request);
}

export async function getVisibleAnnouncements(input: {
  authenticated: boolean;
  locale: AppLocale;
  now?: Date;
}): Promise<LocalizedAnnouncement[]> {
  const now = input.now ?? new Date();
  const result = await getDatabasePool().query<ManagedAnnouncement>(
    `SELECT ${announcementSelection}
       FROM ${schemaName()}.announcements
      WHERE status = 'published'
        AND published_at IS NOT NULL
        AND (expires_at IS NULL OR expires_at > $1)
        AND (audience = 'all' OR $2::boolean)
      ORDER BY CASE tone
        WHEN 'critical' THEN 2
        WHEN 'warning' THEN 1
        ELSE 0
      END DESC, published_at DESC
      LIMIT $3`,
    [now, input.authenticated, MAX_ACTIVE_ANNOUNCEMENTS],
  );
  return selectVisibleAnnouncements(result.rows, {
    authenticated: input.authenticated,
    now,
  }).map((announcement) => localizeAnnouncement(announcement, input.locale));
}
