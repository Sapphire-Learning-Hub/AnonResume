import {
  assertAnnouncementCanPublish,
  localizeAnnouncement,
  selectVisibleAnnouncements,
  type AnnouncementRecord,
} from "@/lib/announcements/rules";

const now = new Date("2026-09-16T08:00:00.000Z");

function announcement(
  overrides: Partial<AnnouncementRecord> = {},
): AnnouncementRecord {
  return {
    id: crypto.randomUUID(),
    titleZh: "测试公告",
    bodyZh: "公告正文",
    titleEn: null,
    bodyEn: null,
    tone: "info",
    audience: "all",
    dismissible: true,
    status: "published",
    publishedAt: new Date("2026-09-16T07:00:00.000Z"),
    expiresAt: null,
    ...overrides,
  };
}

describe("announcement visibility rules", () => {
  it("returns only announcements visible to the current audience and time", () => {
    const publicNotice = announcement({ id: "public" });
    const accountNotice = announcement({
      id: "account",
      audience: "authenticated",
      publishedAt: new Date("2026-09-16T07:30:00.000Z"),
    });
    const expiredNotice = announcement({
      id: "expired",
      expiresAt: new Date("2026-09-16T07:59:59.000Z"),
    });
    const draftNotice = announcement({ id: "draft", status: "draft" });
    const withdrawnNotice = announcement({
      id: "withdrawn",
      status: "withdrawn",
    });

    expect(
      selectVisibleAnnouncements(
        [publicNotice, accountNotice, expiredNotice, draftNotice, withdrawnNotice],
        { authenticated: false, now },
      ).map((notice) => notice.id),
    ).toEqual(["public"]);

    expect(
      selectVisibleAnnouncements(
        [publicNotice, accountNotice, expiredNotice, draftNotice, withdrawnNotice],
        { authenticated: true, now },
      ).map((notice) => notice.id),
    ).toEqual(["account", "public"]);
  });

  it("prioritizes critical announcements and returns at most three", () => {
    const notices = [
      announcement({ id: "old-info", publishedAt: new Date("2026-09-15T08:00:00Z") }),
      announcement({ id: "new-info", publishedAt: new Date("2026-09-16T07:30:00Z") }),
      announcement({ id: "warning", tone: "warning" }),
      announcement({ id: "critical", tone: "critical" }),
    ];

    expect(
      selectVisibleAnnouncements(notices, { authenticated: true, now }).map(
        (notice) => notice.id,
      ),
    ).toEqual(["critical", "warning", "new-info"]);
  });

  it("falls back to Chinese when English content is incomplete", () => {
    const notice = announcement({
      titleEn: "Preview notice",
      bodyEn: null,
    });

    expect(localizeAnnouncement(notice, "en-US")).toMatchObject({
      title: "测试公告",
      body: "公告正文",
    });
    expect(localizeAnnouncement(notice, "zh-CN")).toMatchObject({
      title: "测试公告",
      body: "公告正文",
    });
  });

  it("rejects publication when the active limit is reached", () => {
    expect(() =>
      assertAnnouncementCanPublish(announcement({ status: "draft" }), {
        activeCount: 3,
        now,
      }),
    ).toThrowError("At most 3 announcements can be active");
  });

  it("rejects expired or already published announcements", () => {
    expect(() =>
      assertAnnouncementCanPublish(
        announcement({
          status: "draft",
          expiresAt: new Date("2026-09-16T08:00:00.000Z"),
        }),
        { activeCount: 0, now },
      ),
    ).toThrowError("Announcement cannot be published in its current state");

    expect(() =>
      assertAnnouncementCanPublish(announcement(), { activeCount: 0, now }),
    ).toThrowError("Announcement cannot be published in its current state");
  });
});
