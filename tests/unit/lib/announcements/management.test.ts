import { randomUUID } from "node:crypto";

import { getDatabaseSchemaName } from "@/db";
import {
  createAnnouncement,
  deleteAnnouncementDraft,
  listManagedAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
  withdrawAnnouncement,
} from "@/lib/announcements/management";
import { AnnouncementActiveLimitError } from "@/lib/announcements/rules";
import { getDatabasePool } from "@/lib/runtime/database";

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("announcement management", () => {
  const actorUserId = `announcement-test-${randomUUID()}`;
  const createdIds: string[] = [];

  beforeAll(async () => {
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Announcement test', $2, true, now(), now())`,
      [actorUserId, `${actorUserId}@example.com`],
    );
  });

  afterAll(async () => {
    const schema = quoteIdentifier(getDatabaseSchemaName());
    await getDatabasePool().query(
      `DELETE FROM ${schema}.admin_audit_events
       WHERE target_type = 'announcement' AND target_id = ANY($1::text[])`,
      [createdIds],
    );
    await getDatabasePool().query(
      `DELETE FROM ${schema}.announcements WHERE id = ANY($1::uuid[])`,
      [createdIds],
    );
    await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [
      actorUserId,
    ]);
  });

  async function createDraft(title: string) {
    const created = await createAnnouncement({
      actorUserId,
      draft: {
        titleZh: title,
        bodyZh: `${title}正文`,
        titleEn: null,
        bodyEn: null,
        tone: "info",
        audience: "all",
        dismissible: true,
        expiresAt: null,
      },
    });
    createdIds.push(created.id);
    return created;
  }

  it("supports the audited draft, publish, withdraw and delete lifecycle", async () => {
    const created = await createDraft("生命周期公告");
    expect(created.status).toBe("draft");

    const updated = await updateAnnouncement({
      actorUserId,
      announcementId: created.id,
      draft: {
        titleZh: "更新后的公告",
        bodyZh: "更新后的正文",
        titleEn: "Updated notice",
        bodyEn: "Updated body",
        tone: "warning",
        audience: "authenticated",
        dismissible: false,
        expiresAt: null,
      },
    });
    expect(updated).toMatchObject({
      titleZh: "更新后的公告",
      status: "draft",
      tone: "warning",
    });

    const published = await publishAnnouncement({
      actorUserId,
      announcementId: created.id,
    });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeInstanceOf(Date);

    const withdrawn = await withdrawAnnouncement({
      actorUserId,
      announcementId: created.id,
    });
    expect(withdrawn.status).toBe("withdrawn");

    const disposable = await createDraft("待删除公告");
    await expect(
      deleteAnnouncementDraft({
        actorUserId,
        announcementId: disposable.id,
      }),
    ).resolves.toBeUndefined();

    const schema = quoteIdentifier(getDatabaseSchemaName());
    const audit = await getDatabasePool().query<{ action: string }>(
      `SELECT action FROM ${schema}.admin_audit_events
       WHERE target_type = 'announcement' AND target_id = $1
       ORDER BY created_at`,
      [created.id],
    );
    expect(audit.rows.map((event) => event.action)).toEqual([
      "announcement.create",
      "announcement.update",
      "announcement.publish",
      "announcement.withdraw",
    ]);
  });

  it("enforces the global active announcement limit atomically", async () => {
    const first = await createDraft("名额一");
    const second = await createDraft("名额二");
    const blocked = await createDraft("超出名额");

    await publishAnnouncement({ actorUserId, announcementId: first.id });
    await publishAnnouncement({ actorUserId, announcementId: second.id });
    await expect(
      publishAnnouncement({ actorUserId, announcementId: blocked.id }),
    ).rejects.toBeInstanceOf(AnnouncementActiveLimitError);

    await withdrawAnnouncement({ actorUserId, announcementId: first.id });
    await withdrawAnnouncement({ actorUserId, announcementId: second.id });
  });

  it("returns paginated management records", async () => {
    const result = await listManagedAnnouncements({ page: 1, pageSize: 2 });
    expect(result.pageSize).toBe(2);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.items.length).toBeLessThanOrEqual(2);
  });
});
