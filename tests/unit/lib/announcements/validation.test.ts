import { parseAnnouncementDraft } from "@/lib/announcements/validation";

describe("announcement draft validation", () => {
  it("trims valid bilingual announcement content", () => {
    expect(
      parseAnnouncementDraft({
        titleZh: "  系统维护  ",
        bodyZh: "  服务将在今晚维护。  ",
        titleEn: "  Scheduled maintenance  ",
        bodyEn: "  Service maintenance is planned tonight.  ",
        tone: "warning",
        audience: "authenticated",
        dismissible: false,
        expiresAt: "2026-09-20T08:00:00.000Z",
      }),
    ).toEqual({
      titleZh: "系统维护",
      bodyZh: "服务将在今晚维护。",
      titleEn: "Scheduled maintenance",
      bodyEn: "Service maintenance is planned tonight.",
      tone: "warning",
      audience: "authenticated",
      dismissible: false,
      expiresAt: new Date("2026-09-20T08:00:00.000Z"),
    });
  });

  it("normalizes empty optional English content and expiry", () => {
    expect(
      parseAnnouncementDraft({
        titleZh: "公告",
        bodyZh: "正文",
        titleEn: " ",
        bodyEn: "",
        tone: "info",
        audience: "all",
        dismissible: true,
        expiresAt: null,
      }),
    ).toMatchObject({ titleEn: null, bodyEn: null, expiresAt: null });
  });

  it("rejects incomplete English content", () => {
    expect(() =>
      parseAnnouncementDraft({
        titleZh: "公告",
        bodyZh: "正文",
        titleEn: "Notice",
        bodyEn: "",
        tone: "info",
        audience: "all",
        dismissible: true,
      }),
    ).toThrowError("English title and body must be provided together");
  });
});
